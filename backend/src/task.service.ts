import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RedisService } from './redis.service';
import { SprintService } from './sprint.service';

// New interfaces for index-based pagination
interface IndexPaginationOptions {
  sprintId: string;
  index: number;
  limit: number;
  isForward: boolean;
}

interface IndexPaginatedResult<T> {
  tasks: T[];
  total: number;
  currentIndex: number;
  hasNext: boolean;
  hasPrev: boolean;
  startIndex: number;
  endIndex: number;
}

@Injectable()
export class TaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly redisService: RedisService,
    private readonly sprintService: SprintService,
  ) {}

  async createTask(input: { title: string; hours: number; sprintId: string; parentId?: string; assignedTo?: string; description?: string }) {
    const { title, hours, sprintId, description } = input;
    const sanitizedParentId = input.parentId === '' || input.parentId === undefined ? null : input.parentId ?? null;
    const sanitizedAssignedTo = input.assignedTo === '' || input.assignedTo === undefined ? null : input.assignedTo ?? null;
  
    // Validate related records
    const sprint = await this.prisma.sprint.findUnique({ where: { id: sprintId } });
    if (!sprint) throw new BadRequestException('Invalid sprintId: sprint not found');
  
    if (sanitizedParentId) {
      const parent = await this.prisma.task.findUnique({ where: { id: sanitizedParentId } });
      if (!parent) throw new BadRequestException('Invalid parentId: parent task not found');
    }
  
    if (sanitizedAssignedTo) {
      const user = await this.prisma.user.findUnique({ where: { id: sanitizedAssignedTo } });
      if (!user) throw new BadRequestException('Invalid assignedTo: user not found');
    }
  
    try {
      const newTask = await this.prisma.task.create({
        data: {
          title,
          hours: Number(hours),
          sprintId,
          parentId: sanitizedParentId,
          assignedTo: sanitizedAssignedTo,
          description: description || '',
        },
      });
  
      // Update parent's has_children flag
      if (sanitizedParentId) {
        await this.prisma.task.update({
          where: { id: sanitizedParentId },
          data: { hasChildren: true },
        });
        // Invalidate children cache for parent task
        await this.invalidateTaskChildrenCache(sanitizedParentId);
      }

      // Update sprint's hasChildren flag to true since a task was added
      await this.sprintService.updateSprintHasChildren(sprintId, true);

      // Emit task created event
      this.eventEmitter.emit('task.created', {
        sprintId: newTask.sprintId,
        taskId: newTask.id,
        action: 'created'
      });

      // Invalidate cache after creating task
      await this.invalidateSprintCache(newTask.sprintId);
  
      return newTask;
    } catch (err: any) {
      throw new BadRequestException(err?.message ?? 'Failed to create task');
    }
  }

  async updateTask(input: { id: string; title?: string; hours?: number; parentId?: string | null; sprintId?: string; assignedTo?: string | null; description?: string }) {
    const { id, ...data } = input;
    if (data.parentId === '') data.parentId = null;
    if (data.assignedTo === '') data.assignedTo = null;
    const exists = await this.prisma.task.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Task not found');
    // Validate foreign keys if provided
    if (data.sprintId) {
      const sprint = await this.prisma.sprint.findUnique({ where: { id: data.sprintId } });
      if (!sprint) {
        throw new BadRequestException('Invalid sprintId: sprint not found');
      }
    }
    if (data.parentId !== undefined && data.parentId !== null) {
      const parent = await this.prisma.task.findUnique({ where: { id: data.parentId } });
      if (!parent) {
        throw new BadRequestException('Invalid parentId: parent task not found');
      }
      }
    if (data.assignedTo !== undefined && data.assignedTo !== null) {
      const user = await this.prisma.user.findUnique({ where: { id: data.assignedTo } });
      if (!user) {
        throw new BadRequestException('Invalid assignedTo: user not found');
      }
    }
    try {
      const updatedTask = await this.prisma.task.update({
        where: { id },
        data: {
          ...data,
          hours: data.hours !== undefined ? Number(data.hours) : undefined,
        },
      });

      // Emit task updated event
      this.eventEmitter.emit('task.updated', {
        sprintId: updatedTask.sprintId,
        taskId: updatedTask.id,
        action: 'updated'
      });

      // Invalidate cache after updating task
      await this.invalidateSprintCache(updatedTask.sprintId);

      return updatedTask;
    } catch (err: any) {
      throw new BadRequestException(err?.message ?? 'Failed to update task');
    }
  }

  async deleteTask(id: string) {
    console.log(`Starting deleteTask for task ID: ${id}`);
    
    // Find the task to delete, including its parentId and sprintId
    const task = await this.prisma.task.findUnique({ 
      where: { id },
      select: { id: true, parentId: true, sprintId: true, hasChildren: true }
    });
  
    if (!task) throw new NotFoundException('Task not found');

    console.log(`Found task to delete:`, { id: task.id, sprintId: task.sprintId, hasChildren: task.hasChildren });

    // If the task has children, delete them recursively first
    if (task.hasChildren) {
      console.log(`Task has children, deleting them recursively`);
      await this.deleteTaskChildrenRecursively(id);
    }
  
    // Delete the task
    console.log(`Deleting main task: ${id}`);
    await this.prisma.task.delete({ where: { id } });
  
    // If the task had a parent, check if parent has any remaining children
    if (task.parentId) {
      const remainingChildren = await this.prisma.task.count({
        where: { parentId: task.parentId }
      });
  
      // If no children remain, update parent's hasChildren flag
      if (remainingChildren === 0) {
        await this.prisma.task.update({
          where: { id: task.parentId },
          data: { hasChildren: false },
        });
      }
      // Invalidate children cache for parent task
      await this.invalidateTaskChildrenCache(task.parentId);
    }

    // If the task being deleted had children, invalidate its children cache
    if (task.hasChildren) {
      await this.invalidateTaskChildrenCache(task.id);
    }

    // Emit task deleted event
    this.eventEmitter.emit('task.deleted', {
      sprintId: task.sprintId,
      taskId: task.id,
      action: 'deleted'
    });

    // Check if sprint still has any tasks after deletion
    const remainingTasksInSprint = await this.prisma.task.count({
      where: { sprintId: task.sprintId }
    });

    // If no tasks remain in the sprint, set hasChildren to false
    if (remainingTasksInSprint === 0) {
      await this.sprintService.updateSprintHasChildren(task.sprintId, false);
    }

    // Invalidate cache after deleting task
    console.log(`Invalidating cache for sprint: ${task.sprintId}`);
    await this.invalidateSprintCache(task.sprintId);
  
    console.log(`Completed deleteTask for task ID: ${id}`);
    return { id, deleted: true, sprintId: task.sprintId };
  }

  // Helper method to recursively delete all children of a task
  private async deleteTaskChildrenRecursively(parentId: string): Promise<void> {
    // Find all direct children of this task
    const children = await this.prisma.task.findMany({
      where: { parentId },
      select: { id: true, hasChildren: true }
    });

    console.log(`Found ${children.length} direct children for task ${parentId}`);

    // For each child, recursively delete its children first, then delete the child
    for (const child of children) {
      if (child.hasChildren) {
        await this.deleteTaskChildrenRecursively(child.id);
      }
      console.log(`Deleting child task: ${child.id}`);
      await this.prisma.task.delete({ where: { id: child.id } });
    }
  }

  // Helper method to add assignee name to tasks
  private async addAssigneeNameToTasks(tasks: any[]): Promise<any[]> {
    const tasksWithAssignee = await Promise.all(
      tasks.map(async (task) => {
        if (task.assignedTo) {
          const user = await this.prisma.user.findUnique({
            where: { id: task.assignedTo },
            select: { id: true, name: true }
          });
          return {
            ...task,
            assigneeName: user?.name || null
          };
        }
        return {
          ...task,
          assigneeName: null
        };
      })
    );
    return tasksWithAssignee;
  }

  //TODO: add caching
  async getParentTasks(sprintId: string) {
    if (!sprintId || sprintId.trim() === '') {
      throw new BadRequestException('sprintId is required');
    }
    const tasks = await this.prisma.task.findMany({
      where: { sprintId, parentId: null },
    });
    return this.addAssigneeNameToTasks(tasks);
  }

  async getAllTasksBySprint(sprintId: string) {
    if (!sprintId || sprintId.trim() === '') {
      throw new BadRequestException('sprintId is required');
    }
    const tasks = await this.prisma.task.findMany({
      where: { sprintId },
      orderBy: { id: 'asc' },
    });
    return this.addAssigneeNameToTasks(tasks);
  }

  async getTaskChildren(taskId: string) {
    if (!taskId || taskId.trim() === '') {
      throw new BadRequestException('taskId is required');
    }
    
    // First check if the task exists
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    
    const children = await this.prisma.task.findMany({
      where: { parentId: taskId },
      orderBy: { id: 'asc' },
    });
    return this.addAssigneeNameToTasks(children);
  }

  // New method for index-based pagination of child tasks
  async getTaskChildrenWithIndex(
    taskId: string,
    options: Omit<IndexPaginationOptions, 'sprintId'>
  ): Promise<IndexPaginatedResult<any>> {
    const { index, limit = 5, isForward } = options;

    if (!taskId || taskId.trim() === '') {
      throw new BadRequestException('taskId is required');
    }

    if (index < 0) {
      throw new BadRequestException('index must be non-negative');
    }

    if (limit < 1 || limit > 100) {
      throw new BadRequestException('limit must be between 1 and 100');
    }

    // First check if the task exists
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Try to get cached result first
    const cacheKey = `children:task:${taskId}:index:${index}:limit:${limit}:forward:${isForward}`;
    const cachedResult = await this.redisService.get(cacheKey);
    
    if (cachedResult) {
      console.log('Cache hit for children pagination:', cacheKey);
      return cachedResult;
    }

    // Get total count with caching
    const total = await this.getCachedChildrenCount(taskId);

    if (total === 0) {
      const emptyResult = {
        tasks: [],
        total: 0,
        currentIndex: 0,
        hasNext: false,
        hasPrev: false,
        startIndex: 0,
        endIndex: 0
      };
      
      // Cache empty result for 5 minutes
      await this.redisService.set(cacheKey, emptyResult, 300);
      return emptyResult;
    }

    // Calculate start and end indices (reusing same logic as getAllTasksBySprintWithIndex)
    let startIndex: number;
    let endIndex: number;

    if (isForward) {
      // Forward pagination: start from index, get next 'limit' items
      startIndex = index;
      endIndex = Math.min(index + limit - 1, total - 1);
    } else {
      // Backward pagination: start from index, get previous 'limit' items
      startIndex = Math.max(0, index - limit + 1);
      endIndex = index;
    }

    // Ensure we don't go beyond bounds
    startIndex = Math.max(0, Math.min(startIndex, total - 1));
    endIndex = Math.max(0, Math.min(endIndex, total - 1));

    // Get child tasks using OFFSET and LIMIT
    const children = await this.prisma.task.findMany({
      where: { parentId: taskId },
      orderBy: { id: 'asc' },
      skip: startIndex,
      take: endIndex - startIndex + 1,
    });

    // Add assignee names to tasks
    const childrenWithAssignee = await this.addAssigneeNameToTasks(children);

    // Calculate pagination metadata
    const hasNext = endIndex < total - 1;
    const hasPrev = startIndex > 0;
    const currentIndex = isForward ? startIndex : endIndex;

    const result = {
      tasks: childrenWithAssignee,
      total,
      currentIndex,
      hasNext,
      hasPrev,
      startIndex,
      endIndex
    };

    // Cache the result for 5 minutes
    await this.redisService.set(cacheKey, result, 300);
    console.log('Cached children pagination result:', cacheKey);

    return result;
  }

  async updateTaskStatus(taskId: string, newStatus: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED') {
    if (!taskId || taskId.trim() === '') {
      throw new BadRequestException('taskId is required');
    }

    // Check if the task exists and get current status
    const task = await this.prisma.task.findUnique({ 
      where: { id: taskId },
      select: { id: true, status: true, sprintId: true }
    });
    
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Only update if status is different
    if (task.status === newStatus) {
      return { ...task, updated: false, message: 'Status is already set to the requested value' };
    }

    try {
      const updatedTask = await this.prisma.task.update({
        where: { id: taskId },
        data: { status: newStatus },
        select: { 
          id: true, 
          status: true, 
          title: true, 
          sprintId: true,
          assignedTo: true,
        }
      });

      // Add assignee name to the result
      let assigneeName: string | null = null;
      if (updatedTask.assignedTo) {
        const user = await this.prisma.user.findUnique({
          where: { id: updatedTask.assignedTo },
          select: { id: true, name: true }
        });
        assigneeName = user?.name || null;
      }

      // Invalidate cache after updating task status
      await this.invalidateSprintCache(updatedTask.sprintId);

      return { 
        ...updatedTask, 
        assigneeName,
        updated: true, 
        message: 'Status updated successfully' 
      };
    } catch (err: any) {
      throw new BadRequestException(err?.message ?? 'Failed to update task status');
    }
  }

  async updateTaskDescription(taskId: string, description: string) {
    if (!taskId || taskId.trim() === '') {
      throw new BadRequestException('taskId is required');
    }

    // Check if the task exists
    const task = await this.prisma.task.findUnique({ 
      where: { id: taskId },
      select: { id: true, sprintId: true }
    });
    
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    try {
      const updatedTask = await this.prisma.task.update({
        where: { id: taskId },
        data: { description },
        select: { 
          id: true, 
          description: true, 
          title: true, 
          sprintId: true,
        }
      });

      // Invalidate cache after updating task description
      await this.invalidateSprintCache(updatedTask.sprintId);

      return { 
        ...updatedTask, 
        updated: true, 
        message: 'Description updated successfully' 
      };
    } catch (err: any) {
      throw new BadRequestException(err?.message ?? 'Failed to update task description');
    }
  }

  async updateTaskName(taskId: string, name: string) {
    if (!taskId || taskId.trim() === '') {
      throw new BadRequestException('taskId is required');
    }

    // Check if the task exists
    const task = await this.prisma.task.findUnique({ 
      where: { id: taskId },
      select: { id: true, sprintId: true }
    });
    
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    try {
      const updatedTask = await this.prisma.task.update({
        where: { id: taskId },
        data: { title: name },
        select: { 
          id: true, 
          title: true, 
          sprintId: true,
        }
      });

      // Invalidate cache after updating task name
      await this.invalidateSprintCache(updatedTask.sprintId);

      return { 
        ...updatedTask, 
        updated: true, 
        message: 'Name updated successfully' 
      };
    } catch (err: any) {
      throw new BadRequestException(err?.message ?? 'Failed to update task name');
    }
  }

  // New method for index-based pagination of parent tasks only
  async getAllTasksBySprintWithIndex(
    options: IndexPaginationOptions
  ): Promise<IndexPaginatedResult<any>> {
    const { sprintId, index, limit = 5, isForward } = options;

    if (!sprintId || sprintId.trim() === '') {
      throw new BadRequestException('sprintId is required');
    }

    if (index < 0) {
      throw new BadRequestException('index must be non-negative');
    }

    if (limit < 1 || limit > 100) {
      throw new BadRequestException('limit must be between 1 and 100');
    }

    // Try to get cached result first
    const cacheKey = `tasks:sprint:${sprintId}:index:${index}:limit:${limit}:forward:${isForward}`;
    const cachedResult = await this.redisService.get(cacheKey);
    
    if (cachedResult) {
      console.log('Cache hit for tasks pagination:', cacheKey);
      return cachedResult;
    }

    // Get total count with caching
    const total = await this.getCachedTaskCount(sprintId);

    if (total === 0) {
      const emptyResult = {
        tasks: [],
        total: 0,
        currentIndex: 0,
        hasNext: false,
        hasPrev: false,
        startIndex: 0,
        endIndex: 0
      };
      
      // Cache empty result for 5 minutes
      await this.redisService.set(cacheKey, emptyResult, 300);
      return emptyResult;
    }

    // Calculate start and end indices
    let startIndex: number;
    let endIndex: number;

    if (isForward) {
      // Forward pagination: start from index, get next 'limit' items
      startIndex = index;
      endIndex = Math.min(index + limit - 1, total - 1);
    } else {
      // Backward pagination: start from index, get previous 'limit' items
      startIndex = Math.max(0, index - limit + 1);
      endIndex = index;
    }

    // Ensure we don't go beyond bounds
    startIndex = Math.max(0, Math.min(startIndex, total - 1));
    endIndex = Math.max(0, Math.min(endIndex, total - 1));

    // Get parent tasks only (ones with parentId: null) using OFFSET and LIMIT
    const tasks = await this.prisma.task.findMany({
      where: { sprintId, parentId: null },
      orderBy: { id: 'asc' },
      skip: startIndex,
      take: endIndex - startIndex + 1,
    });

    // Add assignee names to tasks
    const tasksWithAssignee = await this.addAssigneeNameToTasks(tasks);

    // Calculate pagination metadata
    const hasNext = endIndex < total - 1;
    const hasPrev = startIndex > 0;
    const currentIndex = isForward ? startIndex : endIndex;

    const result = {
      tasks: tasksWithAssignee,
      total,
      currentIndex,
      hasNext,
      hasPrev,
      startIndex,
      endIndex
    };

    // Cache the result for 5 minutes
    await this.redisService.set(cacheKey, result, 300);
    console.log('Cached tasks pagination result:', cacheKey);

    return result;
  }

  // Helper method to get cached task count
  private async getCachedTaskCount(sprintId: string): Promise<number> {
    const cacheKey = `tasks:sprint:${sprintId}:count`;
    
    // Try to get from cache first
    const cachedCount = await this.redisService.get(cacheKey);
    if (cachedCount !== null) {
      console.log(`Returning cached task count for sprint ${sprintId}:`, cachedCount);
      return parseInt(cachedCount);
    }

    // If not in cache, get from database - count only parent tasks
    const total = await this.prisma.task.count({
      where: { sprintId, parentId: null }
    });
 
    // Cache the count for 10 minutes
    await this.redisService.set(cacheKey, total, 600);
    console.log('Cached task count for sprint:', sprintId, '=', total);

    return total;
  }

  // Helper method to get cached children count
  private async getCachedChildrenCount(taskId: string): Promise<number> {
    const cacheKey = `children:task:${taskId}:count`;
    
    // Try to get from cache first
    const cachedCount = await this.redisService.get(cacheKey);
    if (cachedCount !== null) {
      console.log(`Returning cached children count for task ${taskId}:`, cachedCount);
      return parseInt(cachedCount);
    }

    // If not in cache, get from database
    const total = await this.prisma.task.count({
      where: { parentId: taskId }
    });
 
    // Cache the count for 10 minutes
    await this.redisService.set(cacheKey, total, 600);
    console.log('Cached children count for task:', taskId, '=', total);

    return total;
  }

  // Helper method to invalidate cache for a sprint
  public async invalidateSprintCache(sprintId: string): Promise<void> {
    try {
      // Delete all "tasks:" related caches for this sprint
      const pattern = `tasks:sprint:${sprintId}:*`;
      
      // Debug: List all keys that match the pattern before deletion
      const matchingKeys = await this.redisService.getKeysByPattern(pattern);
      console.log(`Found ${matchingKeys.length} cache keys matching pattern "${pattern}":`, matchingKeys);
      
      const deletedCount = await this.redisService.delByPattern(pattern);
      
      console.log(`Invalidated ${deletedCount} cache entries for sprint:`, sprintId);
      
      // Also delete any other task-related caches that might exist
      const generalTaskPattern = `tasks:*:${sprintId}:*`;
      const generalDeletedCount = await this.redisService.delByPattern(generalTaskPattern);
      
      if (generalDeletedCount > 0) {
        console.log(`Invalidated ${generalDeletedCount} additional cache entries for sprint:`, sprintId);
      }
    } catch (error) {
      console.error('Error invalidating cache for sprint:', sprintId, error);
    }
  }

  // Helper method to invalidate cache for task children
  public async invalidateTaskChildrenCache(taskId: string): Promise<void> {
    try {
      // Delete all "children:" related caches for this task
      const pattern = `children:task:${taskId}:*`;
      
      // Debug: List all keys that match the pattern before deletion
      const matchingKeys = await this.redisService.getKeysByPattern(pattern);
      console.log(`Found ${matchingKeys.length} children cache keys matching pattern "${pattern}":`, matchingKeys);
      
      const deletedCount = await this.redisService.delByPattern(pattern);
      
      console.log(`Invalidated ${deletedCount} children cache entries for task:`, taskId);
    } catch (error) {
      console.error('Error invalidating children cache for task:', taskId, error);
    }
  }
}


