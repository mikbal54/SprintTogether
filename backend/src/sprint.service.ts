import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from './redis.service';

@Injectable()
export class SprintService {
  private readonly CACHE_KEY = 'sprints:all';
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getAll() {
    // Try to get from cache first
    const cachedSprints = await this.redis.get(this.CACHE_KEY);
    if (cachedSprints) {
      return cachedSprints;
    }

    // If not in cache, fetch from database
    const sprints = await this.prisma.sprint.findMany({
      orderBy: { createdAt: 'desc' },
    });

    // Store in cache
    await this.redis.set(this.CACHE_KEY, sprints, this.CACHE_TTL);

    return sprints;
  }

  private async invalidateCache() {
    await this.redis.del(this.CACHE_KEY);
  }

  async updateSprintHasChildren(id: string, hasChildren: boolean) {
    const result = await this.prisma.sprint.update({
      where: { id },
      data: { hasChildren },
    });
    
    // Invalidate cache after modification
    await this.invalidateCache();
    
    return result;
  }

  async create(name: string) {
    const result = await this.prisma.sprint.create({
      data: {
        name,
        description: '',
        status: 'OPEN',
      },
    });
    
    // Invalidate cache after creation
    await this.invalidateCache();
    
    return result;
  }

  async updateSprintStatus(id: string, status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED') {
    const result = await this.prisma.sprint.update({
      where: { id },
      data: { status },
    });
    
    // Invalidate cache after modification
    await this.invalidateCache();
    
    return result;
  }

  async updateSprintDescription(id: string, description: string) {
    const result = await this.prisma.sprint.update({
      where: { id },
      data: { description },
    });
    
    // Invalidate cache after modification
    await this.invalidateCache();
    
    return result;
  }

  async updateSprintName(id: string, name: string) {
    const result = await this.prisma.sprint.update({
      where: { id },
      data: { name },
    });
    
    // Invalidate cache after modification
    await this.invalidateCache();
    
    return result;
  }

  async deleteSprint(id: string) {
    console.log(`Starting deleteSprint for sprint ID: ${id}`);
    
    // Find the sprint to delete
    const sprint = await this.prisma.sprint.findUnique({ 
      where: { id },
      select: { id: true, name: true }
    });
  
    if (!sprint) throw new Error('Sprint not found');

    console.log(`Found sprint to delete:`, { id: sprint.id, name: sprint.name });

    // Delete all tasks in the sprint first (due to foreign key constraints)
    console.log(`Deleting all tasks in sprint: ${id}`);
    await this.prisma.task.deleteMany({
      where: { sprintId: id }
    });

    // Delete the sprint
    console.log(`Deleting sprint: ${id}`);
    await this.prisma.sprint.delete({ where: { id } });
  
    // Invalidate cache after deletion
    await this.invalidateCache();

    console.log(`Sprint deleted successfully: ${id}`);
    
    return {
      id: sprint.id,
      name: sprint.name,
      deleted: true
    };
  }
}



