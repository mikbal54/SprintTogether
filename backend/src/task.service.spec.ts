import { Test, TestingModule } from '@nestjs/testing';
import { TaskService } from './task.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RedisService } from './redis.service';
import { SprintService } from './sprint.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('TaskService', () => {
  let service: TaskService;
  let prismaService: PrismaService;
  let eventEmitter: EventEmitter2;
  let redisService: RedisService;
  let sprintService: SprintService;

  const mockPrismaService = {
    task: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    sprint: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    delByPattern: jest.fn(),
    getKeysByPattern: jest.fn().mockResolvedValue([]),
  };

  const mockSprintService = {
    updateSprintHasChildren: jest.fn(),
  };

  afterEach(async () => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    // Clean up any remaining mocks
    jest.restoreAllMocks();
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: RedisService, useValue: mockRedisService },
        { provide: SprintService, useValue: mockSprintService },
      ],
    }).compile();

    service = module.get<TaskService>(TaskService);
    prismaService = module.get<PrismaService>(PrismaService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
    redisService = module.get<RedisService>(RedisService);
    sprintService = module.get<SprintService>(SprintService);

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  describe('createTask', () => {
    const validTaskInput = {
      title: 'Test Task',
      hours: 8,
      sprintId: 'sprint-123',
      description: 'Test description',
    };

    const mockSprint = { id: 'sprint-123', name: 'Test Sprint' };
    const mockUser = { id: 'user-123', name: 'Test User' };
    const mockParentTask = { id: 'parent-123', title: 'Parent Task' };

    it('should create a task with valid input', async () => {
      const mockCreatedTask = {
        id: 'task-123',
        ...validTaskInput,
        parentId: null,
        assignedTo: null,
        status: 'OPEN',
        hasChildren: false,
      };

      mockPrismaService.sprint.findUnique.mockResolvedValue(mockSprint);
      mockPrismaService.task.create.mockResolvedValue(mockCreatedTask);
      mockRedisService.delByPattern.mockResolvedValue(1);

      const result = await service.createTask(validTaskInput);

      expect(mockPrismaService.sprint.findUnique).toHaveBeenCalledWith({
        where: { id: validTaskInput.sprintId },
      });
      expect(mockPrismaService.task.create).toHaveBeenCalledWith({
        data: {
          title: validTaskInput.title,
          hours: validTaskInput.hours,
          sprintId: validTaskInput.sprintId,
          parentId: null,
          assignedTo: null,
          description: validTaskInput.description,
        },
      });
      expect(mockSprintService.updateSprintHasChildren).toHaveBeenCalledWith(
        validTaskInput.sprintId,
        true,
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('task.created', {
        sprintId: mockCreatedTask.sprintId,
        taskId: mockCreatedTask.id,
        action: 'created',
      });
      expect(result).toEqual(mockCreatedTask);
    });

    it('should create a task with parent and assignee', async () => {
      const taskInputWithParent = {
        ...validTaskInput,
        parentId: 'parent-123',
        assignedTo: 'user-123',
      };

      const mockCreatedTask = {
        id: 'task-123',
        ...taskInputWithParent,
        status: 'OPEN',
        hasChildren: false,
      };

      mockPrismaService.sprint.findUnique.mockResolvedValue(mockSprint);
      mockPrismaService.task.findUnique
        .mockResolvedValueOnce(mockParentTask)
        .mockResolvedValueOnce(mockUser);
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.task.create.mockResolvedValue(mockCreatedTask);
      mockPrismaService.task.update.mockResolvedValue({ ...mockParentTask, hasChildren: true });
      mockRedisService.delByPattern.mockResolvedValue(1);

      const result = await service.createTask(taskInputWithParent);

      expect(mockPrismaService.task.findUnique).toHaveBeenCalledWith({
        where: { id: 'parent-123' },
      });
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
      });
      expect(mockPrismaService.task.update).toHaveBeenCalledWith({
        where: { id: 'parent-123' },
        data: { hasChildren: true },
      });
      expect(result).toEqual(mockCreatedTask);
    });

    it('should throw BadRequestException for invalid sprintId', async () => {
      mockPrismaService.sprint.findUnique.mockResolvedValue(null);

      await expect(service.createTask(validTaskInput)).rejects.toThrow(
        new BadRequestException('Invalid sprintId: sprint not found'),
      );
    });

    it('should throw BadRequestException for invalid parentId', async () => {
      const taskInputWithInvalidParent = {
        ...validTaskInput,
        parentId: 'invalid-parent',
      };

      // Reset all mocks to ensure clean state
      jest.resetAllMocks();
      mockPrismaService.sprint.findUnique.mockResolvedValue(mockSprint);
      mockPrismaService.task.findUnique.mockResolvedValue(null);
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.createTask(taskInputWithInvalidParent)).rejects.toThrow(
        new BadRequestException('Invalid parentId: parent task not found'),
      );
    });

    it('should throw BadRequestException for invalid assignedTo', async () => {
      const taskInputWithInvalidUser = {
        ...validTaskInput,
        assignedTo: 'invalid-user',
      };

      mockPrismaService.sprint.findUnique.mockResolvedValue(mockSprint);
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.createTask(taskInputWithInvalidUser)).rejects.toThrow(
        new BadRequestException('Invalid assignedTo: user not found'),
      );
    });

    it('should handle empty strings for optional fields', async () => {
      const taskInputWithEmptyFields = {
        ...validTaskInput,
        parentId: '',
        assignedTo: '',
      };

      const mockCreatedTask = {
        id: 'task-123',
        ...validTaskInput,
        parentId: null,
        assignedTo: null,
        status: 'OPEN',
        hasChildren: false,
      };

      mockPrismaService.sprint.findUnique.mockResolvedValue(mockSprint);
      mockPrismaService.task.create.mockResolvedValue(mockCreatedTask);
      mockRedisService.delByPattern.mockResolvedValue(1);

      const result = await service.createTask(taskInputWithEmptyFields);

      expect(mockPrismaService.task.create).toHaveBeenCalledWith({
        data: {
          title: validTaskInput.title,
          hours: validTaskInput.hours,
          sprintId: validTaskInput.sprintId,
          parentId: null,
          assignedTo: null,
          description: validTaskInput.description,
        },
      });
      expect(result).toEqual(mockCreatedTask);
    });
  });

  describe('updateTask', () => {
    const mockExistingTask = {
      id: 'task-123',
      title: 'Original Task',
      hours: 8,
      sprintId: 'sprint-123',
      parentId: null,
      assignedTo: null,
      status: 'OPEN',
    };

    it('should update a task with valid data', async () => {
      const updateInput = {
        id: 'task-123',
        title: 'Updated Task',
        hours: 12,
      };

      const mockUpdatedTask = {
        ...mockExistingTask,
        ...updateInput,
      };

      mockPrismaService.task.findUnique.mockResolvedValue(mockExistingTask);
      mockPrismaService.task.update.mockResolvedValue(mockUpdatedTask);
      mockRedisService.delByPattern.mockResolvedValue(1);

      const result = await service.updateTask(updateInput);

      expect(mockPrismaService.task.findUnique).toHaveBeenCalledWith({
        where: { id: updateInput.id },
      });
      expect(mockPrismaService.task.update).toHaveBeenCalledWith({
        where: { id: updateInput.id },
        data: {
          title: updateInput.title,
          hours: updateInput.hours,
        },
      });
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('task.updated', {
        sprintId: mockUpdatedTask.sprintId,
        taskId: mockUpdatedTask.id,
        action: 'updated',
      });
      expect(result).toEqual(mockUpdatedTask);
    });

    it('should throw NotFoundException for non-existent task', async () => {
      const updateInput = { id: 'non-existent', title: 'Updated Task' };

      mockPrismaService.task.findUnique.mockResolvedValue(null);

      await expect(service.updateTask(updateInput)).rejects.toThrow(
        new NotFoundException('Task not found'),
      );
    });

    it('should validate sprintId when provided', async () => {
      const updateInput = {
        id: 'task-123',
        sprintId: 'invalid-sprint',
      };

      mockPrismaService.task.findUnique.mockResolvedValue(mockExistingTask);
      mockPrismaService.sprint.findUnique.mockResolvedValue(null);

      await expect(service.updateTask(updateInput)).rejects.toThrow(
        new BadRequestException('Invalid sprintId: sprint not found'),
      );
    });

    it('should handle empty strings for optional fields', async () => {
      const updateInput = {
        id: 'task-123',
        parentId: '',
        assignedTo: '',
      };

      const mockUpdatedTask = {
        ...mockExistingTask,
        parentId: null,
        assignedTo: null,
      };

      mockPrismaService.task.findUnique.mockResolvedValue(mockExistingTask);
      mockPrismaService.task.update.mockResolvedValue(mockUpdatedTask);
      mockRedisService.delByPattern.mockResolvedValue(1);

      const result = await service.updateTask(updateInput);

      expect(mockPrismaService.task.update).toHaveBeenCalledWith({
        where: { id: updateInput.id },
        data: {
          parentId: null,
          assignedTo: null,
        },
      });
      expect(result).toEqual(mockUpdatedTask);
    });
  });

  describe('deleteTask', () => {
    const mockTaskToDelete = {
      id: 'task-123',
      parentId: null,
      sprintId: 'sprint-123',
      hasChildren: false,
    };

    it('should delete a task without children', async () => {
      mockPrismaService.task.findUnique.mockResolvedValue(mockTaskToDelete);
      mockPrismaService.task.delete.mockResolvedValue(mockTaskToDelete);
      mockPrismaService.task.count.mockResolvedValue(5); // Other tasks in sprint
      mockRedisService.delByPattern.mockResolvedValue(1);

      const result = await service.deleteTask('task-123');

      expect(mockPrismaService.task.findUnique).toHaveBeenCalledWith({
        where: { id: 'task-123' },
        select: { id: true, parentId: true, sprintId: true, hasChildren: true },
      });
      expect(mockPrismaService.task.delete).toHaveBeenCalledWith({
        where: { id: 'task-123' },
      });
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('task.deleted', {
        sprintId: mockTaskToDelete.sprintId,
        taskId: mockTaskToDelete.id,
        action: 'deleted',
      });
      expect(result).toEqual({
        id: 'task-123',
        deleted: true,
        sprintId: 'sprint-123',
      });
    });

    it('should delete a task with children recursively', async () => {
      const mockTaskWithChildren = {
        ...mockTaskToDelete,
        hasChildren: true,
      };

      const mockChildren = [
        { id: 'child-1', hasChildren: false },
        { id: 'child-2', hasChildren: true },
      ];

      const mockGrandChildren = [
        { id: 'grandchild-1', hasChildren: false },
        { id: 'grandchild-2', hasChildren: false },
      ];

      mockPrismaService.task.findUnique.mockResolvedValue(mockTaskWithChildren);
      
      // Mock findMany to return different results based on the parentId
      mockPrismaService.task.findMany.mockImplementation((args) => {
        if (args.where.parentId === 'task-123') {
          return Promise.resolve(mockChildren);
        } else if (args.where.parentId === 'child-2') {
          return Promise.resolve(mockGrandChildren);
        }
        return Promise.resolve([]);
      });
      
      mockPrismaService.task.delete.mockResolvedValue({});
      mockPrismaService.task.count.mockResolvedValue(5); // Other tasks in sprint
      mockRedisService.delByPattern.mockResolvedValue(1);

      const result = await service.deleteTask('task-123');

      expect(mockPrismaService.task.findMany).toHaveBeenCalledWith({
        where: { parentId: 'task-123' },
        select: { id: true, hasChildren: true },
      });
      expect(mockPrismaService.task.delete).toHaveBeenCalledTimes(5); // parent + 2 children + 2 grandchildren
      expect(result).toEqual({
        id: 'task-123',
        deleted: true,
        sprintId: 'sprint-123',
      });
    });

    it('should update parent hasChildren flag when no children remain', async () => {
      const mockTaskWithParent = {
        ...mockTaskToDelete,
        parentId: 'parent-123',
      };

      mockPrismaService.task.findUnique.mockResolvedValue(mockTaskWithParent);
      mockPrismaService.task.delete.mockResolvedValue(mockTaskWithParent);
      mockPrismaService.task.count.mockResolvedValue(0); // No remaining children
      mockPrismaService.task.update.mockResolvedValue({ id: 'parent-123', hasChildren: false });
      mockRedisService.delByPattern.mockResolvedValue(1);

      await service.deleteTask('task-123');

      expect(mockPrismaService.task.update).toHaveBeenCalledWith({
        where: { id: 'parent-123' },
        data: { hasChildren: false },
      });
    });

    it('should throw NotFoundException for non-existent task', async () => {
      mockPrismaService.task.findUnique.mockResolvedValue(null);

      await expect(service.deleteTask('non-existent')).rejects.toThrow(
        new NotFoundException('Task not found'),
      );
    });
  });

  describe('getParentTasks', () => {
    it('should return parent tasks for a sprint', async () => {
      const mockTasks = [
        { id: 'task-1', title: 'Task 1', assignedTo: 'user-1' },
        { id: 'task-2', title: 'Task 2', assignedTo: null },
      ];

      const mockUser = { id: 'user-1', name: 'Test User' };

      mockPrismaService.task.findMany.mockResolvedValue(mockTasks);
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getParentTasks('sprint-123');

      expect(mockPrismaService.task.findMany).toHaveBeenCalledWith({
        where: { sprintId: 'sprint-123', parentId: null },
      });
      expect(result).toEqual([
        { ...mockTasks[0], assigneeName: 'Test User' },
        { ...mockTasks[1], assigneeName: null },
      ]);
    });

    it('should throw BadRequestException for empty sprintId', async () => {
      await expect(service.getParentTasks('')).rejects.toThrow(
        new BadRequestException('sprintId is required'),
      );
    });
  });

  describe('getAllTasksBySprint', () => {
    it('should return all tasks for a sprint', async () => {
      const mockTasks = [
        { id: 'task-1', title: 'Task 1', assignedTo: 'user-1' },
        { id: 'task-2', title: 'Task 2', assignedTo: null },
      ];

      const mockUser = { id: 'user-1', name: 'Test User' };

      mockPrismaService.task.findMany.mockResolvedValue(mockTasks);
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getAllTasksBySprint('sprint-123');

      expect(mockPrismaService.task.findMany).toHaveBeenCalledWith({
        where: { sprintId: 'sprint-123' },
        orderBy: { id: 'asc' },
      });
      expect(result).toEqual([
        { ...mockTasks[0], assigneeName: 'Test User' },
        { ...mockTasks[1], assigneeName: null },
      ]);
    });

    it('should throw BadRequestException for empty sprintId', async () => {
      await expect(service.getAllTasksBySprint('')).rejects.toThrow(
        new BadRequestException('sprintId is required'),
      );
    });
  });

  describe('getTaskChildren', () => {
    it('should return children of a task', async () => {
      const mockChildren = [
        { id: 'child-1', title: 'Child 1', assignedTo: 'user-1' },
        { id: 'child-2', title: 'Child 2', assignedTo: null },
      ];

      const mockTask = { id: 'parent-123', title: 'Parent Task' };
      const mockUser = { id: 'user-1', name: 'Test User' };

      mockPrismaService.task.findUnique
        .mockResolvedValueOnce(mockTask)
        .mockResolvedValueOnce(mockUser);
      mockPrismaService.task.findMany.mockResolvedValue(mockChildren);

      const result = await service.getTaskChildren('parent-123');

      expect(mockPrismaService.task.findUnique).toHaveBeenCalledWith({
        where: { id: 'parent-123' },
      });
      expect(mockPrismaService.task.findMany).toHaveBeenCalledWith({
        where: { parentId: 'parent-123' },
        orderBy: { id: 'asc' },
      });
      expect(result).toEqual([
        { ...mockChildren[0], assigneeName: 'Test User' },
        { ...mockChildren[1], assigneeName: null },
      ]);
    });

    it('should throw NotFoundException for non-existent task', async () => {
      // Reset all mocks to ensure clean state
      jest.resetAllMocks();
      mockPrismaService.task.findUnique.mockResolvedValue(null);
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.task.findMany.mockResolvedValue([]);

      await expect(service.getTaskChildren('non-existent')).rejects.toThrow(
        new NotFoundException('Task not found'),
      );
    });

    it('should throw BadRequestException for empty taskId', async () => {
      await expect(service.getTaskChildren('')).rejects.toThrow(
        new BadRequestException('taskId is required'),
      );
    });
  });

  describe('updateTaskStatus', () => {
    const mockTask = {
      id: 'task-123',
      status: 'OPEN',
      sprintId: 'sprint-123',
      assignedTo: 'user-1',
    };

    it('should update task status', async () => {
      const mockUpdatedTask = {
        ...mockTask,
        status: 'IN_PROGRESS',
        title: 'Test Task',
      };

      const mockUser = { id: 'user-1', name: 'Test User' };

      mockPrismaService.task.findUnique.mockResolvedValue(mockTask);
      mockPrismaService.task.update.mockResolvedValue(mockUpdatedTask);
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockRedisService.delByPattern.mockResolvedValue(1);

      const result = await service.updateTaskStatus('task-123', 'IN_PROGRESS');

      expect(mockPrismaService.task.update).toHaveBeenCalledWith({
        where: { id: 'task-123' },
        data: { status: 'IN_PROGRESS' },
        select: {
          id: true,
          status: true,
          title: true,
          sprintId: true,
          assignedTo: true,
        },
      });
      expect(result).toEqual({
        ...mockUpdatedTask,
        assigneeName: 'Test User',
        updated: true,
        message: 'Status updated successfully',
      });
    });

    it('should return early if status is already set', async () => {
      mockPrismaService.task.findUnique.mockResolvedValue(mockTask);

      const result = await service.updateTaskStatus('task-123', 'OPEN');

      expect(mockPrismaService.task.update).not.toHaveBeenCalled();
      expect(result).toEqual({
        ...mockTask,
        updated: false,
        message: 'Status is already set to the requested value',
      });
    });

    it('should throw NotFoundException for non-existent task', async () => {
      mockPrismaService.task.findUnique.mockResolvedValue(null);

      await expect(service.updateTaskStatus('non-existent', 'IN_PROGRESS')).rejects.toThrow(
        new NotFoundException('Task not found'),
      );
    });
  });

  describe('updateTaskDescription', () => {
    const mockTask = {
      id: 'task-123',
      sprintId: 'sprint-123',
    };

    it('should update task description', async () => {
      const mockUpdatedTask = {
        id: 'task-123',
        description: 'Updated description',
        title: 'Test Task',
        sprintId: 'sprint-123',
      };

      mockPrismaService.task.findUnique.mockResolvedValue(mockTask);
      mockPrismaService.task.update.mockResolvedValue(mockUpdatedTask);
      mockRedisService.delByPattern.mockResolvedValue(1);

      const result = await service.updateTaskDescription('task-123', 'Updated description');

      expect(mockPrismaService.task.update).toHaveBeenCalledWith({
        where: { id: 'task-123' },
        data: { description: 'Updated description' },
        select: {
          id: true,
          description: true,
          title: true,
          sprintId: true,
        },
      });
      expect(result).toEqual({
        ...mockUpdatedTask,
        updated: true,
        message: 'Description updated successfully',
      });
    });

    it('should throw NotFoundException for non-existent task', async () => {
      mockPrismaService.task.findUnique.mockResolvedValue(null);

      await expect(service.updateTaskDescription('non-existent', 'New description')).rejects.toThrow(
        new NotFoundException('Task not found'),
      );
    });
  });

  describe('updateTaskName', () => {
    const mockTask = {
      id: 'task-123',
      sprintId: 'sprint-123',
    };

    it('should update task name', async () => {
      const mockUpdatedTask = {
        id: 'task-123',
        title: 'Updated Task Name',
        sprintId: 'sprint-123',
      };

      mockPrismaService.task.findUnique.mockResolvedValue(mockTask);
      mockPrismaService.task.update.mockResolvedValue(mockUpdatedTask);
      mockRedisService.delByPattern.mockResolvedValue(1);

      const result = await service.updateTaskName('task-123', 'Updated Task Name');

      expect(mockPrismaService.task.update).toHaveBeenCalledWith({
        where: { id: 'task-123' },
        data: { title: 'Updated Task Name' },
        select: {
          id: true,
          title: true,
          sprintId: true,
        },
      });
      expect(result).toEqual({
        ...mockUpdatedTask,
        updated: true,
        message: 'Name updated successfully',
      });
    });

    it('should throw NotFoundException for non-existent task', async () => {
      mockPrismaService.task.findUnique.mockResolvedValue(null);

      await expect(service.updateTaskName('non-existent', 'New Name')).rejects.toThrow(
        new NotFoundException('Task not found'),
      );
    });
  });

  describe('getAllTasksBySprintWithIndex', () => {
    it('should return paginated tasks with cache hit', async () => {
      const mockCachedResult = {
        tasks: [{ id: 'task-1', title: 'Task 1' }],
        total: 10,
        currentIndex: 0,
        hasNext: true,
        hasPrev: false,
        startIndex: 0,
        endIndex: 4,
      };

      mockRedisService.get.mockResolvedValue(mockCachedResult);

      const result = await service.getAllTasksBySprintWithIndex({
        sprintId: 'sprint-123',
        index: 0,
        limit: 5,
        isForward: true,
      });

      expect(mockRedisService.get).toHaveBeenCalledWith(
        'tasks:sprint:sprint-123:index:0:limit:5:forward:true',
      );
      expect(result).toEqual(mockCachedResult);
    });

    it('should return paginated tasks with cache miss', async () => {
      const mockTasks = [
        { id: 'task-1', title: 'Task 1', assignedTo: 'user-1' },
        { id: 'task-2', title: 'Task 2', assignedTo: null },
      ];

      const mockUser = { id: 'user-1', name: 'Test User' };

      mockRedisService.get.mockResolvedValue(null);
      mockPrismaService.task.count.mockResolvedValue(10);
      mockPrismaService.task.findMany.mockResolvedValue(mockTasks);
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockRedisService.set.mockResolvedValue(undefined);

      const result = await service.getAllTasksBySprintWithIndex({
        sprintId: 'sprint-123',
        index: 0,
        limit: 5,
        isForward: true,
      });

      expect(mockPrismaService.task.count).toHaveBeenCalledWith({
        where: { sprintId: 'sprint-123', parentId: null },
      });
      expect(mockPrismaService.task.findMany).toHaveBeenCalledWith({
        where: { sprintId: 'sprint-123', parentId: null },
        orderBy: { id: 'asc' },
        skip: 0,
        take: 5,
      });
      expect(mockRedisService.set).toHaveBeenCalled();
      expect(result.tasks).toEqual([
        { ...mockTasks[0], assigneeName: 'Test User' },
        { ...mockTasks[1], assigneeName: null },
      ]);
    });

    it('should throw BadRequestException for invalid parameters', async () => {
      await expect(
        service.getAllTasksBySprintWithIndex({
          sprintId: '',
          index: 0,
          limit: 5,
          isForward: true,
        }),
      ).rejects.toThrow(new BadRequestException('sprintId is required'));

      await expect(
        service.getAllTasksBySprintWithIndex({
          sprintId: 'sprint-123',
          index: -1,
          limit: 5,
          isForward: true,
        }),
      ).rejects.toThrow(new BadRequestException('index must be non-negative'));

      await expect(
        service.getAllTasksBySprintWithIndex({
          sprintId: 'sprint-123',
          index: 0,
          limit: 0,
          isForward: true,
        }),
      ).rejects.toThrow(new BadRequestException('limit must be between 1 and 100'));
    });
  });

  describe('getTaskChildrenWithIndex', () => {
    it('should return paginated children with cache hit', async () => {
      const mockCachedResult = {
        tasks: [{ id: 'child-1', title: 'Child 1' }],
        total: 5,
        currentIndex: 0,
        hasNext: true,
        hasPrev: false,
        startIndex: 0,
        endIndex: 4,
      };

      const mockTask = { id: 'parent-123', title: 'Parent Task' };

      mockPrismaService.task.findUnique.mockResolvedValue(mockTask);
      mockRedisService.get.mockResolvedValue(mockCachedResult);

      const result = await service.getTaskChildrenWithIndex('parent-123', {
        index: 0,
        limit: 5,
        isForward: true,
      });

      expect(mockPrismaService.task.findUnique).toHaveBeenCalledWith({
        where: { id: 'parent-123' },
      });
      expect(mockRedisService.get).toHaveBeenCalledWith(
        'children:task:parent-123:index:0:limit:5:forward:true',
      );
      expect(result).toEqual(mockCachedResult);
    });

    it('should return paginated children with cache miss', async () => {
      const mockChildren = [
        { id: 'child-1', title: 'Child 1', assignedTo: 'user-1' },
        { id: 'child-2', title: 'Child 2', assignedTo: null },
      ];

      const mockTask = { id: 'parent-123', title: 'Parent Task' };
      const mockUser = { id: 'user-1', name: 'Test User' };

      mockRedisService.get.mockResolvedValue(null);
      mockPrismaService.task.findUnique.mockResolvedValue(mockTask);
      mockPrismaService.task.count.mockResolvedValue(5);
      mockPrismaService.task.findMany.mockResolvedValue(mockChildren);
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockRedisService.set.mockResolvedValue(undefined);

      const result = await service.getTaskChildrenWithIndex('parent-123', {
        index: 0,
        limit: 5,
        isForward: true,
      });

      expect(mockPrismaService.task.findUnique).toHaveBeenCalledWith({
        where: { id: 'parent-123' },
      });
      expect(mockPrismaService.task.count).toHaveBeenCalledWith({
        where: { parentId: 'parent-123' },
      });
      expect(mockPrismaService.task.findMany).toHaveBeenCalledWith({
        where: { parentId: 'parent-123' },
        orderBy: { id: 'asc' },
        skip: 0,
        take: 5,
      });
      expect(result.tasks).toEqual([
        { ...mockChildren[0], assigneeName: 'Test User' },
        { ...mockChildren[1], assigneeName: null },
      ]);
    });

    it('should throw NotFoundException for non-existent task', async () => {
      mockPrismaService.task.findUnique.mockResolvedValue(null);

      await expect(
        service.getTaskChildrenWithIndex('non-existent', {
          index: 0,
          limit: 5,
          isForward: true,
        }),
      ).rejects.toThrow(new NotFoundException('Task not found'));
    });
  });

  describe('cache invalidation', () => {
    it('should invalidate sprint cache', async () => {
      const mockKeys = ['tasks:sprint:123:index:0:limit:5:forward:true'];
      mockRedisService.getKeysByPattern.mockResolvedValue(mockKeys);
      mockRedisService.delByPattern.mockResolvedValue(1);

      await service.invalidateSprintCache('sprint-123');

      expect(mockRedisService.getKeysByPattern).toHaveBeenCalledWith('tasks:sprint:sprint-123:*');
      expect(mockRedisService.delByPattern).toHaveBeenCalledWith('tasks:sprint:sprint-123:*');
    });

    it('should invalidate task children cache', async () => {
      const mockKeys = ['children:task:123:index:0:limit:5:forward:true'];
      mockRedisService.getKeysByPattern.mockResolvedValue(mockKeys);
      mockRedisService.delByPattern.mockResolvedValue(1);

      await service.invalidateTaskChildrenCache('task-123');

      expect(mockRedisService.getKeysByPattern).toHaveBeenCalledWith('children:task:task-123:*');
      expect(mockRedisService.delByPattern).toHaveBeenCalledWith('children:task:task-123:*');
    });
  });
});