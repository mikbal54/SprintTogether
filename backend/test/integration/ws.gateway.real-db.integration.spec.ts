import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Server } from 'socket.io';
import { io as Client, Socket } from 'socket.io-client';
import { WsGateway } from '../../src/ws.gateway';
import { SprintService } from '../../src/sprint.service';
import { TaskService } from '../../src/task.service';
import { RedisService } from '../../src/redis.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '../../src/config.service';
import { WsJwtGuard } from '../../src/ws-jwt.guard';
import { PrismaClient } from '@prisma/client';

describe('WebSocket Gateway Real Database Integration Tests', () => {
  let app: INestApplication;
  let server: Server;
  let client: Socket;
  let prismaService: PrismaService;
  let redisService: RedisService;
  let jwtService: JwtService;
  let taskService: TaskService;
  let sprintService: SprintService;
  let testUser: any;
  let testSprint: any;
  let testTask: any;

  const mockJwtPayload = {
    sub: 'auth0|test-user-real',
    name: 'Test User Real',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  beforeAll(async () => {
    // Set test environment variables
    process.env.DATABASE_URL = 'postgresql://test_user:test_password@localhost:5433/test_taskman';
    process.env.REDIS_URL = 'redis://localhost:6380';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      providers: [
        WsGateway,
        SprintService,
        TaskService,
        RedisService,
        PrismaService,
        JwtService,
        EventEmitter2,
        ConfigService,
        WsJwtGuard,
      ],
    })
      .overrideProvider(JwtService)
      .useValue({
        verify: jest.fn().mockReturnValue(mockJwtPayload),
        sign: jest.fn().mockReturnValue('mock-jwt-token'),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.init();
    await app.listen(3000);

    const gateway = app.get<WsGateway>(WsGateway);
    server = gateway.server;
    prismaService = app.get<PrismaService>(PrismaService);
    redisService = app.get<RedisService>(RedisService);
    jwtService = app.get<JwtService>(JwtService);
    taskService = app.get<TaskService>(TaskService);
    sprintService = app.get<SprintService>(SprintService);

    // Create test data - use upsert to handle existing user
    testUser = await prismaService.user.upsert({
      where: { auth0Id: 'auth0|test-user-real' },
      update: {
        name: 'Test User Real',
      },
      create: {
        name: 'Test User Real',
        auth0Id: 'auth0|test-user-real',
      },
    });

    testSprint = await prismaService.sprint.create({
      data: {
        name: 'Test Sprint Real',
        description: 'Test Description Real',
        status: 'OPEN',
      },
    });

    testTask = await prismaService.task.create({
      data: {
        title: 'Test Task Real',
        hours: 8,
        status: 'OPEN',
        description: 'Test Task Description Real',
        sprintId: testSprint.id,
      },
    });

    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterAll(async () => {
    // Clean up test data
    await prismaService.task.deleteMany({
      where: {
        sprintId: testSprint.id,
      },
    });
    await prismaService.sprint.delete({
      where: { id: testSprint.id },
    });
    await prismaService.user.delete({
      where: { id: testUser.id },
    });

    if (client) {
      client.close();
    }
    
    // Close WebSocket server
    if (server) {
      server.close();
    }
    
    // Close Prisma connection
    await prismaService.$disconnect();
    
    // Close the app
    await app.close();
    
    // Give time for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  beforeEach(async () => {
    // Create a new client for each test
    client = Client('http://localhost:3000', {
      extraHeaders: {
        cookie: 'jwt=mock-jwt-token',
      },
    });

    // Wait for connection
    await new Promise<void>((resolve) => {
      client.on('connect', () => resolve());
      client.connect();
    });
  });

  afterEach(async () => {
    if (client) {
      client.close();
    }
    
    // Clear all mocks
    jest.clearAllMocks();
    
    // Wait for connection cleanup
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('Real Database Operations', () => {
    it('should create a real task in database', async () => {
      const taskData = {
        title: 'Real Task Created',
        hours: 6,
        sprintId: testSprint.id,
        description: 'Real task created via WebSocket',
      };

      const createPromise = new Promise<any>((resolve) => {
        client.on('task:create', (data) => {
          resolve(data);
        });
      });

      client.emit('task:create', taskData);
      const result = await createPromise;

      expect(result.result).toBeDefined();
      expect(result.result.title).toBe(taskData.title);
      expect(result.result.sprintId).toBe(testSprint.id);

      // Verify task was actually created in database
      const createdTask = await prismaService.task.findUnique({
        where: { id: result.result.id },
      });
      expect(createdTask).toBeDefined();
      expect(createdTask!.title).toBe(taskData.title);

      // Clean up
      await prismaService.task.delete({
        where: { id: result.result.id },
      });
    });

    it('should update task status in database', async () => {
      // Create a specific task for this test
      const testTaskForStatus = await prismaService.task.create({
        data: {
          title: 'Test Task for Status Update',
          hours: 4,
          status: 'OPEN',
          description: 'Test task for status update',
          sprintId: testSprint.id,
        },
      });

      const statusData = {
        id: testTaskForStatus.id,
        status: 'IN_PROGRESS',
      };

      const updatePromise = new Promise<any>((resolve) => {
        client.on('task:set_status', (data) => {
          resolve(data);
        });
      });

      client.emit('task:set_status', statusData);
      const result = await updatePromise;

      expect(result.result).toBeDefined();
      expect(result.result.status).toBe('IN_PROGRESS');

      // Verify task was actually updated in database
      const updatedTask = await prismaService.task.findUnique({
        where: { id: testTaskForStatus.id },
      });
      expect(updatedTask!.status).toBe('IN_PROGRESS');

      // Clean up the test task
      await prismaService.task.delete({
        where: { id: testTaskForStatus.id },
      });
    });

    it('should create a real sprint in database', async () => {
      const sprintData = {
        name: 'Real Sprint Created',
      };

      const createPromise = new Promise<any>((resolve) => {
        client.on('sprint:create', (data) => {
          resolve(data);
        });
      });

      client.emit('sprint:create', sprintData);
      const result = await createPromise;

      expect(result.result).toBeDefined();
      expect(result.result.name).toBe(sprintData.name);

      // Verify sprint was actually created in database
      const createdSprint = await prismaService.sprint.findUnique({
        where: { id: result.result.id },
      });
      expect(createdSprint).toBeDefined();
      expect(createdSprint!.name).toBe(sprintData.name);

      // Clean up
      await prismaService.sprint.delete({
        where: { id: result.result.id },
      });
    });

    it('should get real tasks from database', async () => {
      const taskData = {
        sprintId: testSprint.id,
        index: 0,
        limit: 10,
        isForward: true,
      };

      const getPromise = new Promise<any>((resolve) => {
        client.on('task:get_by_index', (data) => {
          resolve(data);
        });
      });

      client.emit('task:get_by_index', taskData);
      const result = await getPromise;

      expect(result.tasks).toBeDefined();
      expect(Array.isArray(result.tasks)).toBe(true);
      expect(result.tasks.length).toBeGreaterThan(0);
      expect(result.tasks[0].sprintId).toBe(testSprint.id);
    });

    it('should handle Redis operations for online users', async () => {
      const onlinePromise = new Promise<any>((resolve) => {
        client.on('user:online_users', (data) => {
          resolve(data);
        });
      });

      client.emit('user:request_online_users', {});
      const result = await onlinePromise;

      expect(result.users).toBeDefined();
      expect(result.count).toBeDefined();
      expect(Array.isArray(result.users)).toBe(true);
    });

    it('should handle task deletion with cascade', async () => {
      // Create a parent task
      const parentTask = await prismaService.task.create({
        data: {
          title: 'Parent Task',
          hours: 4,
          sprintId: testSprint.id,
          hasChildren: true,
        },
      });

      // Create a child task
      const childTask = await prismaService.task.create({
        data: {
          title: 'Child Task',
          hours: 2,
          sprintId: testSprint.id,
          parentId: parentTask.id,
        },
      });

      const deletePromise = new Promise<any>((resolve) => {
        client.on('task:request_delete', (data) => {
          resolve(data);
        });
      });

      client.emit('task:request_delete', { taskId: parentTask.id });
      const result = await deletePromise;

      expect(result.result).toBeDefined();

      // Verify both tasks were deleted
      const deletedParent = await prismaService.task.findUnique({
        where: { id: parentTask.id },
      });
      const deletedChild = await prismaService.task.findUnique({
        where: { id: childTask.id },
      });

      expect(deletedParent).toBeNull();
      expect(deletedChild).toBeNull();
    });

    it('should handle concurrent task operations', async () => {
      const concurrentTasks: any[] = [];
      const promises: Promise<any>[] = [];

      // Create multiple tasks concurrently
      for (let i = 0; i < 3; i++) {
        const taskData = {
          title: `Concurrent Task ${i}`,
          hours: 2,
          sprintId: testSprint.id,
        };

        const promise = new Promise<any>((resolve) => {
          client.on('task:create', (data) => {
            if (data.result && data.result.title === taskData.title) {
              resolve(data);
            }
          });
        });

        promises.push(promise);
        concurrentTasks.push(taskData);
      }

      // Emit all tasks at once
      concurrentTasks.forEach(taskData => {
        client.emit('task:create', taskData);
      });

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.result).toBeDefined();
        expect(result.result.title).toMatch(/Concurrent Task \d/);
      });

      // Clean up
      for (const result of results) {
        await prismaService.task.delete({
          where: { id: result.result.id },
        });
      }
    });

    it('should handle Redis connection and disconnection', async () => {
      // Test Redis operations
      await redisService.set('test:key', 'test:value');
      const value = await redisService.get('test:key');
      expect(value).toBe('test:value');

      await redisService.del('test:key');
      const deletedValue = await redisService.get('test:key');
      expect(deletedValue).toBeNull();
    });

    it('should handle database transaction rollback on error', async () => {
      const invalidTaskData = {
        title: '', // Invalid empty title
        hours: -1, // Invalid negative hours
        sprintId: 'non-existent-sprint', // Invalid sprint ID
      };

      const errorPromise = new Promise<any>((resolve) => {
        client.on('task:create', (data) => {
          resolve(data);
        });
      });

      client.emit('task:create', invalidTaskData);
      const result = await errorPromise;

      expect(result.error).toBeDefined();
      expect(result.error).toContain('title is required');

      // Verify no task was created in database
      const tasks = await prismaService.task.findMany({
        where: {
          title: invalidTaskData.title,
        },
      });
      expect(tasks).toHaveLength(0);
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle multiple concurrent clients', async () => {
      const clients: Socket[] = [];
      const promises: Promise<void>[] = [];

      // Create 5 concurrent clients
      for (let i = 0; i < 5; i++) {
        const newClient = Client('http://localhost:3000', {
          extraHeaders: {
            cookie: 'jwt=mock-jwt-token',
          },
        });

        const connectPromise = new Promise<void>((resolve) => {
          newClient.on('connect', () => resolve());
        });

        newClient.connect();
        clients.push(newClient);
        promises.push(connectPromise);
      }

      await Promise.all(promises);

      // All clients should be connected
      clients.forEach(client => {
        expect(client.connected).toBe(true);
      });

      // Clean up
      clients.forEach(client => client.close());
    });

    it('should handle rapid task operations', async () => {
      const operations: any[] = [];
      const promises: Promise<any>[] = [];

      // Perform 10 rapid task status updates
      for (let i = 0; i < 10; i++) {
        const statusData = {
          id: testTask.id,
          status: i % 2 === 0 ? 'OPEN' : 'IN_PROGRESS',
        };

        const promise = new Promise<any>((resolve) => {
          client.on('task:set_status', (data) => {
            if (data.result && data.result.id === testTask.id) {
              resolve(data);
            }
          });
        });

        operations.push(statusData);
        promises.push(promise);
      }

      // Emit all operations rapidly
      operations.forEach(data => {
        client.emit('task:set_status', data);
      });

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.result).toBeDefined();
        expect(result.result.id).toBe(testTask.id);
      });

      // Reset status
      await prismaService.task.update({
        where: { id: testTask.id },
        data: { status: 'OPEN' },
      });
    });
  });
});
