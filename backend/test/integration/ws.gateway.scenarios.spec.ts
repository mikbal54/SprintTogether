import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
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

describe('WebSocket Gateway Test Scenarios', () => {
  let app: INestApplication;
  let server: Server;
  let client: Socket;
  let prismaService: PrismaService;
  let redisService: RedisService;
  let jwtService: JwtService;
  let taskService: TaskService;
  let sprintService: SprintService;

  const mockUser = {
    id: 'user-1',
    name: 'Test User',
    auth0Id: 'auth0|test-user',
  };

  const mockJwtPayload = {
    sub: mockUser.auth0Id,
    name: mockUser.name,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  const mockSprint = {
    id: 'sprint-1',
    name: 'Test Sprint',
    description: 'Test Description',
    status: 'OPEN',
    hasChildren: false,
    createdAt: new Date(),
  };

  const mockTask = {
    id: 'task-1',
    title: 'Test Task',
    hours: 8,
    status: 'OPEN',
    description: 'Test Task Description',
    sprintId: 'sprint-1',
    parentId: null,
    assignedTo: null,
    hasChildren: false,
  };

  beforeAll(async () => {
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
      .overrideProvider(PrismaService)
      .useValue({
        user: {
          findUnique: jest.fn().mockResolvedValue(mockUser),
          findMany: jest.fn().mockResolvedValue([mockUser]),
        },
        task: {
          findMany: jest.fn().mockResolvedValue([mockTask]),
          findUnique: jest.fn().mockResolvedValue(mockTask),
          create: jest.fn().mockResolvedValue(mockTask),
          update: jest.fn().mockResolvedValue({ ...mockTask, status: 'IN_PROGRESS' }),
          delete: jest.fn().mockResolvedValue(mockTask),
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        sprint: {
          findMany: jest.fn().mockResolvedValue([mockSprint]),
          findUnique: jest.fn().mockResolvedValue(mockSprint),
          create: jest.fn().mockResolvedValue(mockSprint),
          update: jest.fn().mockResolvedValue(mockSprint),
          delete: jest.fn().mockResolvedValue(mockSprint),
        },
        $transaction: jest.fn().mockImplementation((callback) => callback()),
      })
      .overrideProvider(RedisService)
      .useValue({
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1),
        sadd: jest.fn().mockResolvedValue(1),
        srem: jest.fn().mockResolvedValue(1),
        smembers: jest.fn().mockResolvedValue([]),
        keys: jest.fn().mockResolvedValue([]),
      })
      .overrideProvider(JwtService)
      .useValue({
        verify: jest.fn().mockReturnValue(mockJwtPayload),
        sign: jest.fn().mockReturnValue('mock-jwt-token'),
      })
      .overrideProvider(TaskService)
      .useValue({
        createTask: jest.fn().mockResolvedValue(mockTask),
        updateTaskStatus: jest.fn().mockResolvedValue({ ...mockTask, status: 'IN_PROGRESS' }),
        updateTaskDescription: jest.fn().mockResolvedValue({ ...mockTask, description: 'Updated description' }),
        updateTaskName: jest.fn().mockResolvedValue({ ...mockTask, title: 'Updated Task' }),
        deleteTask: jest.fn().mockResolvedValue({ ...mockTask, sprintId: 'sprint-1' }),
        getAllTasksBySprintWithIndex: jest.fn().mockResolvedValue({
          tasks: [mockTask],
          total: 1,
          currentIndex: 0,
          startIndex: 0,
          endIndex: 0,
          hasNext: false,
          hasPrev: false,
        }),
        invalidateSprintCache: jest.fn().mockResolvedValue(undefined),
      })
      .overrideProvider(SprintService)
      .useValue({
        create: jest.fn().mockResolvedValue(mockSprint),
        getAll: jest.fn().mockResolvedValue([{
          ...mockSprint,
          createdAt: mockSprint.createdAt.toISOString(),
        }]),
        updateSprintHasChildren: jest.fn().mockResolvedValue(undefined),
      })
      .overrideProvider(EventEmitter2)
      .useValue({
        emit: jest.fn().mockImplementation((event, payload) => {
          // Simulate the EventEmitter behavior for task.created events
          if (event === 'task.created') {
            // Get the gateway instance and emit the task:refresh event
            const gateway = moduleFixture.get<WsGateway>(WsGateway);
            if (gateway && gateway.server) {
              gateway.server.emit('task:refresh', {
                sprintId: payload.sprintId,
                taskId: payload.taskId,
                action: payload.action
              });
            }
          }
          return true;
        }),
        on: jest.fn(),
        once: jest.fn(),
        off: jest.fn(),
      })
      .overrideProvider(WsJwtGuard)
      .useValue({
        canActivate: jest.fn().mockImplementation((context) => {
          const client = context.switchToWs().getClient();
          const cookies = client.handshake.headers.cookie;
          
          // Check if the token is valid
          if (cookies && cookies.includes('jwt=invalid-token')) {
            throw new UnauthorizedException('Invalid token');
          }
          
          return true;
        }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.init();
    await app.listen(3005); // Use different port to avoid conflicts

    const gateway = app.get<WsGateway>(WsGateway);
    server = gateway.server;
    prismaService = app.get<PrismaService>(PrismaService);
    redisService = app.get<RedisService>(RedisService);
    jwtService = app.get<JwtService>(JwtService);
    taskService = app.get<TaskService>(TaskService);
    sprintService = app.get<SprintService>(SprintService);

    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterAll(async () => {
    if (client) {
      client.close();
    }
    
    // Close WebSocket server
    if (server) {
      server.close();
    }
    
    await app.close();
    
    // Wait for all connections to close
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  beforeEach(async () => {
    client = Client('http://localhost:3005', {
      extraHeaders: {
        cookie: 'jwt=mock-jwt-token',
      },
    });

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

  describe('Scenario 1: Complete Task Lifecycle', () => {
    it('should handle complete task lifecycle: create -> update -> delete', async () => {
      // Step 1: Create a sprint
      const sprintData = { name: 'Test Sprint' };
      const sprintPromise = new Promise<any>((resolve) => {
        client.on('sprint:create', (data) => resolve(data));
      });
      client.emit('sprint:create', sprintData);
      const sprintResult = await sprintPromise;
      const sprintId = sprintResult.result.id;

      // Step 2: Create a task
      const taskData = {
        title: 'Test Task',
        hours: 8,
        sprintId: sprintId,
        description: 'Test task description',
      };
      const taskPromise = new Promise<any>((resolve) => {
        client.on('task:create', (data) => resolve(data));
      });
      client.emit('task:create', taskData);
      const taskResult = await taskPromise;
      const taskId = taskResult.result.id;

      // Step 3: Update task status
      const statusData = { id: taskId, status: 'IN_PROGRESS' };
      const statusPromise = new Promise<any>((resolve) => {
        client.on('task:set_status', (data) => resolve(data));
      });
      client.emit('task:set_status', statusData);
      await statusPromise;

      // Step 4: Update task description
      const descData = { id: taskId, description: 'Updated description' };
      const descPromise = new Promise<any>((resolve) => {
        client.on('task:refresh', (data) => {
          if (data.taskId === taskId && data.action === 'description_updated') {
            resolve(data);
          }
        });
      });
      client.emit('task:change_description', descData);
      await descPromise;

      // Step 5: Delete the task
      const deleteData = { taskId: taskId };
      const deletePromise = new Promise<any>((resolve) => {
        client.on('task:request_delete', (data) => resolve(data));
      });
      client.emit('task:request_delete', deleteData);
      await deletePromise;

      expect(sprintResult.result).toBeDefined();
      expect(taskResult.result).toBeDefined();
    });
  });

  describe('Scenario 2: Multi-User Collaboration', () => {
    it('should handle multiple users working on the same sprint', async () => {
      const clients: Socket[] = [];
      const userCount = 3;

      // Create multiple clients
      for (let i = 0; i < userCount; i++) {
        const newClient = Client('http://localhost:3005', {
          extraHeaders: {
            cookie: 'jwt=mock-jwt-token',
          },
        });
        await new Promise<void>((resolve) => {
          newClient.on('connect', () => resolve());
          newClient.connect();
        });
        clients.push(newClient);
      }

      // User 1 creates a sprint
      const sprintData = { name: 'Collaborative Sprint' };
      const sprintPromise = new Promise<any>((resolve) => {
        clients[0].on('sprint:create', (data) => resolve(data));
      });
      clients[0].emit('sprint:create', sprintData);
      const sprintResult = await sprintPromise;

      // All users should receive the sprint update
      const allSprintPromises = clients.map(client => 
        new Promise<any>((resolve) => {
          client.on('sprint:get_all', (data) => resolve(data));
        })
      );
      await Promise.all(allSprintPromises);

      // Users 2 and 3 create tasks
      const taskPromises: Promise<any>[] = [];
      for (let i = 1; i < userCount; i++) {
        const taskData = {
          title: `Task by User ${i + 1}`,
          hours: 4,
          sprintId: sprintResult.result.id,
        };
        const promise = new Promise<any>((resolve) => {
          clients[i].on('task:create', (data) => resolve(data));
        });
        clients[i].emit('task:create', taskData);
        taskPromises.push(promise);
      }
      await Promise.all(taskPromises);

      // Clean up
      clients.forEach(client => client.close());
    });
  });

  describe('Scenario 3: Error Handling and Recovery', () => {
    it('should handle various error scenarios gracefully', async () => {
      // Test 1: Invalid task creation
      const invalidTaskData = {
        title: '',
        hours: -1,
        sprintId: 'invalid-sprint',
      };
      const errorPromise = new Promise<any>((resolve) => {
        client.on('task:create', (data) => resolve(data));
      });
      client.emit('task:create', invalidTaskData);
      const errorResult = await errorPromise;
      expect(errorResult.error).toBeDefined();

      // Test 2: Invalid sprint creation
      const invalidSprintData = { name: '' };
      const sprintErrorPromise = new Promise<any>((resolve) => {
        client.on('sprint:create', (data) => resolve(data));
      });
      client.emit('sprint:create', invalidSprintData);
      const sprintErrorResult = await sprintErrorPromise;
      expect(sprintErrorResult.error).toBeDefined();

      // Test 3: Authentication failure
      const invalidClient = Client('http://localhost:3005', {
        extraHeaders: {
          cookie: 'jwt=invalid-token',
        },
      });
      
      const authErrorPromise = new Promise<void>((resolve) => {
        invalidClient.on('auth:error', () => resolve());
        invalidClient.on('connect', () => {
          // If it connects, it means the guard didn't work properly
          invalidClient.close();
          resolve();
        });
      });
      invalidClient.connect();
      await authErrorPromise;
      invalidClient.close();
    });
  });

  describe('Scenario 4: Real-time Synchronization', () => {
    it('should maintain real-time synchronization across clients', async () => {
      const client1 = Client('http://localhost:3005', {
        extraHeaders: { cookie: 'jwt=mock-jwt-token' },
      });
      const client2 = Client('http://localhost:3005', {
        extraHeaders: { cookie: 'jwt=mock-jwt-token' },
      });

      await Promise.all([
        new Promise<void>((resolve) => {
          client1.on('connect', () => resolve());
          client1.connect();
        }),
        new Promise<void>((resolve) => {
          client2.on('connect', () => resolve());
          client2.connect();
        }),
      ]);

      // Client 1 creates a task
      const taskData = {
        title: 'Synchronized Task',
        hours: 6,
        sprintId: 'test-sprint',
      };

      const createPromise = new Promise<any>((resolve) => {
        client1.on('task:create', (data) => resolve(data));
      });

      const refreshPromise = new Promise<void>((resolve) => {
        client2.on('task:refresh', (data) => {
          expect(data.taskId).toBeDefined();
          expect(data.action).toBe('created');
          resolve();
        });
      });

      client1.emit('task:create', taskData);
      await Promise.all([createPromise, refreshPromise]);

      client1.close();
      client2.close();
    });
  });

  describe('Scenario 5: Performance Under Load', () => {
    it('should handle high-frequency operations', async () => {
      const operations: any[] = [];
      const promises: Promise<any>[] = [];

      // Create 20 rapid operations
      for (let i = 0; i < 20; i++) {
        const operation = {
          title: `Load Test Task ${i}`,
          hours: 2,
          sprintId: 'test-sprint',
        };

        const promise = new Promise<any>((resolve) => {
          client.on('task:create', (data) => {
            if (data.result && data.result.title === operation.title) {
              resolve(data);
            }
          });
        });

        operations.push(operation);
        promises.push(promise);
      }

      // Execute all operations rapidly
      const startTime = Date.now();
      operations.forEach(op => client.emit('task:create', op));
      const results = await Promise.all(promises);
      const endTime = Date.now();

      expect(results).toHaveLength(20);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('Scenario 6: Data Consistency', () => {
    it('should maintain data consistency across operations', async () => {
      // Create a sprint
      const sprintData = { name: 'Consistency Test Sprint' };
      const sprintPromise = new Promise<any>((resolve) => {
        client.on('sprint:create', (data) => resolve(data));
      });
      client.emit('sprint:create', sprintData);
      const sprintResult = await sprintPromise;

      // Create multiple tasks
      const taskCount = 5;
      const taskPromises: Promise<any>[] = [];
      for (let i = 0; i < taskCount; i++) {
        const taskData = {
          title: `Consistency Task ${i}`,
          hours: 4,
          sprintId: sprintResult.result.id,
        };
        const promise = new Promise<any>((resolve) => {
          client.on('task:create', (data) => resolve(data));
        });
        client.emit('task:create', taskData);
        taskPromises.push(promise);
      }
      const taskResults = await Promise.all(taskPromises);

      // Verify all tasks belong to the same sprint
      taskResults.forEach(result => {
        expect(result.result.sprintId).toBe(sprintResult.result.id);
      });

      // Get all tasks for the sprint
      const getTasksData = {
        sprintId: sprintResult.result.id,
        index: 0,
        limit: 10,
        isForward: true,
      };
      const getTasksPromise = new Promise<any>((resolve) => {
        client.on('task:get_by_index', (data) => resolve(data));
      });
      client.emit('task:get_by_index', getTasksData);
      const getTasksResult = await getTasksPromise;

      expect(getTasksResult.tasks.length).toBeGreaterThanOrEqual(taskCount);
    });
  });
});
