import { Test, TestingModule } from '@nestjs/testing';
import { SprintService } from './sprint.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from './redis.service';

describe('SprintService', () => {
  let service: SprintService;
  let prismaService: PrismaService;
  let redisService: RedisService;

  const mockPrismaService = {
    sprint: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SprintService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<SprintService>(SprintService);
    prismaService = module.get<PrismaService>(PrismaService);
    redisService = module.get<RedisService>(RedisService);

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  afterEach(async () => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    jest.restoreAllMocks();
  });

  describe('getAll', () => {
    const mockSprints = [
      {
        id: 'sprint-1',
        name: 'Sprint 1',
        description: 'First sprint',
        status: 'OPEN',
        hasChildren: true,
        createdAt: new Date('2024-01-01'),
      },
      {
        id: 'sprint-2',
        name: 'Sprint 2',
        description: 'Second sprint',
        status: 'IN_PROGRESS',
        hasChildren: false,
        createdAt: new Date('2024-01-02'),
      },
    ];

    it('should return cached sprints when available', async () => {
      mockRedisService.get.mockResolvedValue(mockSprints);

      const result = await service.getAll();

      expect(mockRedisService.get).toHaveBeenCalledWith('sprints:all');
      expect(mockPrismaService.sprint.findMany).not.toHaveBeenCalled();
      expect(mockRedisService.set).not.toHaveBeenCalled();
      expect(result).toEqual(mockSprints);
    });

    it('should fetch from database and cache when cache is empty', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockPrismaService.sprint.findMany.mockResolvedValue(mockSprints);
      mockRedisService.set.mockResolvedValue(undefined);

      const result = await service.getAll();

      expect(mockRedisService.get).toHaveBeenCalledWith('sprints:all');
      expect(mockPrismaService.sprint.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
      });
      expect(mockRedisService.set).toHaveBeenCalledWith('sprints:all', mockSprints, 300);
      expect(result).toEqual(mockSprints);
    });

    it('should handle empty database result', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockPrismaService.sprint.findMany.mockResolvedValue([]);
      mockRedisService.set.mockResolvedValue(undefined);

      const result = await service.getAll();

      expect(mockPrismaService.sprint.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
      });
      expect(mockRedisService.set).toHaveBeenCalledWith('sprints:all', [], 300);
      expect(result).toEqual([]);
    });
  });

  describe('create', () => {
    it('should create a new sprint and invalidate cache', async () => {
      const sprintName = 'New Sprint';
      const mockCreatedSprint = {
        id: 'sprint-123',
        name: sprintName,
        description: '',
        status: 'OPEN',
        hasChildren: false,
        createdAt: new Date(),
      };

      mockPrismaService.sprint.create.mockResolvedValue(mockCreatedSprint);
      mockRedisService.del.mockResolvedValue(1);

      const result = await service.create(sprintName);

      expect(mockPrismaService.sprint.create).toHaveBeenCalledWith({
        data: {
          name: sprintName,
          description: '',
          status: 'OPEN',
        },
      });
      expect(mockRedisService.del).toHaveBeenCalledWith('sprints:all');
      expect(result).toEqual(mockCreatedSprint);
    });

    it('should handle empty sprint name', async () => {
      const mockCreatedSprint = {
        id: 'sprint-123',
        name: '',
        description: '',
        status: 'OPEN',
        hasChildren: false,
        createdAt: new Date(),
      };

      mockPrismaService.sprint.create.mockResolvedValue(mockCreatedSprint);
      mockRedisService.del.mockResolvedValue(1);

      const result = await service.create('');

      expect(mockPrismaService.sprint.create).toHaveBeenCalledWith({
        data: {
          name: '',
          description: '',
          status: 'OPEN',
        },
      });
      expect(result).toEqual(mockCreatedSprint);
    });
  });

  describe('updateSprintHasChildren', () => {
    it('should update sprint hasChildren flag and invalidate cache', async () => {
      const sprintId = 'sprint-123';
      const hasChildren = true;
      const mockUpdatedSprint = {
        id: sprintId,
        name: 'Test Sprint',
        hasChildren: true,
      };

      mockPrismaService.sprint.update.mockResolvedValue(mockUpdatedSprint);
      mockRedisService.del.mockResolvedValue(1);

      const result = await service.updateSprintHasChildren(sprintId, hasChildren);

      expect(mockPrismaService.sprint.update).toHaveBeenCalledWith({
        where: { id: sprintId },
        data: { hasChildren },
      });
      expect(mockRedisService.del).toHaveBeenCalledWith('sprints:all');
      expect(result).toEqual(mockUpdatedSprint);
    });

    it('should handle setting hasChildren to false', async () => {
      const sprintId = 'sprint-123';
      const hasChildren = false;
      const mockUpdatedSprint = {
        id: sprintId,
        name: 'Test Sprint',
        hasChildren: false,
      };

      mockPrismaService.sprint.update.mockResolvedValue(mockUpdatedSprint);
      mockRedisService.del.mockResolvedValue(1);

      const result = await service.updateSprintHasChildren(sprintId, hasChildren);

      expect(mockPrismaService.sprint.update).toHaveBeenCalledWith({
        where: { id: sprintId },
        data: { hasChildren: false },
      });
      expect(result).toEqual(mockUpdatedSprint);
    });
  });

  describe('updateSprintStatus', () => {
    it('should update sprint status to OPEN', async () => {
      const sprintId = 'sprint-123';
      const status = 'OPEN';
      const mockUpdatedSprint = {
        id: sprintId,
        name: 'Test Sprint',
        status: 'OPEN',
      };

      mockPrismaService.sprint.update.mockResolvedValue(mockUpdatedSprint);
      mockRedisService.del.mockResolvedValue(1);

      const result = await service.updateSprintStatus(sprintId, status);

      expect(mockPrismaService.sprint.update).toHaveBeenCalledWith({
        where: { id: sprintId },
        data: { status },
      });
      expect(mockRedisService.del).toHaveBeenCalledWith('sprints:all');
      expect(result).toEqual(mockUpdatedSprint);
    });

    it('should update sprint status to IN_PROGRESS', async () => {
      const sprintId = 'sprint-123';
      const status = 'IN_PROGRESS';
      const mockUpdatedSprint = {
        id: sprintId,
        name: 'Test Sprint',
        status: 'IN_PROGRESS',
      };

      mockPrismaService.sprint.update.mockResolvedValue(mockUpdatedSprint);
      mockRedisService.del.mockResolvedValue(1);

      const result = await service.updateSprintStatus(sprintId, status);

      expect(mockPrismaService.sprint.update).toHaveBeenCalledWith({
        where: { id: sprintId },
        data: { status },
      });
      expect(result).toEqual(mockUpdatedSprint);
    });

    it('should update sprint status to COMPLETED', async () => {
      const sprintId = 'sprint-123';
      const status = 'COMPLETED';
      const mockUpdatedSprint = {
        id: sprintId,
        name: 'Test Sprint',
        status: 'COMPLETED',
      };

      mockPrismaService.sprint.update.mockResolvedValue(mockUpdatedSprint);
      mockRedisService.del.mockResolvedValue(1);

      const result = await service.updateSprintStatus(sprintId, status);

      expect(mockPrismaService.sprint.update).toHaveBeenCalledWith({
        where: { id: sprintId },
        data: { status },
      });
      expect(result).toEqual(mockUpdatedSprint);
    });
  });

  describe('updateSprintDescription', () => {
    it('should update sprint description', async () => {
      const sprintId = 'sprint-123';
      const description = 'Updated description';
      const mockUpdatedSprint = {
        id: sprintId,
        name: 'Test Sprint',
        description: 'Updated description',
      };

      mockPrismaService.sprint.update.mockResolvedValue(mockUpdatedSprint);
      mockRedisService.del.mockResolvedValue(1);

      const result = await service.updateSprintDescription(sprintId, description);

      expect(mockPrismaService.sprint.update).toHaveBeenCalledWith({
        where: { id: sprintId },
        data: { description },
      });
      expect(mockRedisService.del).toHaveBeenCalledWith('sprints:all');
      expect(result).toEqual(mockUpdatedSprint);
    });

    it('should handle empty description', async () => {
      const sprintId = 'sprint-123';
      const description = '';
      const mockUpdatedSprint = {
        id: sprintId,
        name: 'Test Sprint',
        description: '',
      };

      mockPrismaService.sprint.update.mockResolvedValue(mockUpdatedSprint);
      mockRedisService.del.mockResolvedValue(1);

      const result = await service.updateSprintDescription(sprintId, description);

      expect(mockPrismaService.sprint.update).toHaveBeenCalledWith({
        where: { id: sprintId },
        data: { description: '' },
      });
      expect(result).toEqual(mockUpdatedSprint);
    });
  });

  describe('updateSprintName', () => {
    it('should update sprint name', async () => {
      const sprintId = 'sprint-123';
      const name = 'Updated Sprint Name';
      const mockUpdatedSprint = {
        id: sprintId,
        name: 'Updated Sprint Name',
        description: 'Test description',
      };

      mockPrismaService.sprint.update.mockResolvedValue(mockUpdatedSprint);
      mockRedisService.del.mockResolvedValue(1);

      const result = await service.updateSprintName(sprintId, name);

      expect(mockPrismaService.sprint.update).toHaveBeenCalledWith({
        where: { id: sprintId },
        data: { name },
      });
      expect(mockRedisService.del).toHaveBeenCalledWith('sprints:all');
      expect(result).toEqual(mockUpdatedSprint);
    });

    it('should handle empty name', async () => {
      const sprintId = 'sprint-123';
      const name = '';
      const mockUpdatedSprint = {
        id: sprintId,
        name: '',
        description: 'Test description',
      };

      mockPrismaService.sprint.update.mockResolvedValue(mockUpdatedSprint);
      mockRedisService.del.mockResolvedValue(1);

      const result = await service.updateSprintName(sprintId, name);

      expect(mockPrismaService.sprint.update).toHaveBeenCalledWith({
        where: { id: sprintId },
        data: { name: '' },
      });
      expect(result).toEqual(mockUpdatedSprint);
    });
  });

  describe('cache invalidation', () => {
    it('should invalidate cache after any modification', async () => {
      const sprintId = 'sprint-123';
      const mockUpdatedSprint = {
        id: sprintId,
        name: 'Test Sprint',
      };

      mockPrismaService.sprint.update.mockResolvedValue(mockUpdatedSprint);
      mockRedisService.del.mockResolvedValue(1);

      // Test that all update methods invalidate cache
      await service.updateSprintHasChildren(sprintId, true);
      expect(mockRedisService.del).toHaveBeenCalledWith('sprints:all');

      jest.clearAllMocks();

      await service.updateSprintStatus(sprintId, 'OPEN');
      expect(mockRedisService.del).toHaveBeenCalledWith('sprints:all');

      jest.clearAllMocks();

      await service.updateSprintDescription(sprintId, 'Updated description');
      expect(mockRedisService.del).toHaveBeenCalledWith('sprints:all');

      jest.clearAllMocks();

      await service.updateSprintName(sprintId, 'Updated Sprint Name');
      expect(mockRedisService.del).toHaveBeenCalledWith('sprints:all');
    });
  });
});