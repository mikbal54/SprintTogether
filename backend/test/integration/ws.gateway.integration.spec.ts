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
import { ConfigService } from '@nestjs/config';
import { WsJwtGuard } from '../../src/ws-jwt.guard';
import { JwtStrategy } from '../../src/jwt.strategy';

describe('WebSocket Gateway Integration Tests', () => {
  let app: INestApplication;
  let server: Server;
  let client: Socket;
  let httpServer: any; // Store reference to HTTP server
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

  const mockSprint = {
    id: 'sprint-1',
    name: 'Test Sprint',
    description: 'Test Description',
    status: 'OPEN',
    hasChildren: false,
    createdAt: new Date("2025-09-01T01:50:50.045Z"),
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

  const mockJwtPayload = {
    sub: mockUser.auth0Id,
    name: mockUser.name,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
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
        JwtStrategy,
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
          update: jest.fn().mockResolvedValue(mockTask),
          delete: jest.fn().mockResolvedValue(mockTask),
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
          count: jest.fn().mockResolvedValue(1),
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
        getKeysByPattern: jest.fn().mockResolvedValue([]),
        delByPattern: jest.fn().mockResolvedValue(1),
      })
      .overrideProvider(JwtService)
      .useValue({
        verify: jest.fn().mockImplementation((token) => {
          if (token === 'mock-jwt-token') {
            return mockJwtPayload;
          }
          throw new Error('Invalid token');
        }),
        sign: jest.fn().mockReturnValue('mock-jwt-token'),
      })
      .overrideProvider(JwtStrategy)
      .useValue({
        validate: jest.fn().mockResolvedValue({ id: mockUser.auth0Id }),
      })
      .overrideProvider(TaskService)
      .useValue({
        createTask: jest.fn().mockResolvedValue(mockTask),
        getAllTasksBySprintWithIndex: jest.fn().mockResolvedValue({
          tasks: [{ ...mockTask, assigneeName: null }],
          total: 1,
          currentIndex: 0,
          hasNext: false,
          hasPrev: false,
          startIndex: 0,
          endIndex: 0,
        }),
        updateTaskStatus: jest.fn().mockResolvedValue({
          ...mockTask,
          updated: true,
          message: 'Status updated successfully',
          assigneeName: null,
        }),
        deleteTask: jest.fn().mockResolvedValue({
          id: mockTask.id,
          deleted: true,
          sprintId: mockTask.sprintId,
        }),
        invalidateSprintCache: jest.fn().mockResolvedValue(undefined),
      })
      .overrideProvider(SprintService)
      .useValue({
        create: jest.fn().mockResolvedValue(mockSprint),
        updateSprintStatus: jest.fn().mockResolvedValue(mockSprint),
        updateSprintName: jest.fn().mockResolvedValue(mockSprint),
        updateSprintDescription: jest.fn().mockResolvedValue(mockSprint),
        getAll: jest.fn().mockResolvedValue([{
          ...mockSprint,
          createdAt: mockSprint.createdAt.toISOString(),
        }]),
        updateSprintHasChildren: jest.fn().mockResolvedValue(undefined),
      })
      .overrideProvider(WsJwtGuard)
      .useValue({
        canActivate: jest.fn().mockResolvedValue(true),
        getRequest: jest.fn().mockReturnValue({
          headers: { authorization: 'Bearer mock-jwt-token' },
          cookies: { jwt: 'mock-jwt-token' },
          user: { id: mockUser.auth0Id },
        }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.init();
    
    // Store the HTTP server reference for proper cleanup
    httpServer = await app.listen(3002);

    const gateway = app.get<WsGateway>(WsGateway);
    server = gateway.server;
    prismaService = app.get<PrismaService>(PrismaService);
    redisService = app.get<RedisService>(RedisService);
    jwtService = app.get<JwtService>(JwtService);
    taskService = app.get<TaskService>(TaskService);
    sprintService = app.get<SprintService>(SprintService);

    // Wait for server to be ready
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  afterAll(async () => {
    // Close all client connections first
    if (client && client.connected) {
      client.disconnect();
    }
    
    // Close WebSocket server with proper cleanup
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    }
    
    // Close HTTP server
    if (httpServer) {
      await new Promise<void>((resolve) => {
        httpServer.close(() => {
          resolve();
        });
      });
    }
    
    // Close NestJS application
    if (app) {
      await app.close();
    }
    
    // Force cleanup any remaining connections
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    // Reset JWT mock
    (jwtService.verify as jest.Mock).mockImplementation((token) => {
      if (token === 'mock-jwt-token') {
        return mockJwtPayload;
      }
      throw new Error('Invalid token');
    });

    // Create client with proper cleanup options
    client = Client('http://localhost:3002', {
      extraHeaders: {
        cookie: 'jwt=mock-jwt-token',
      },
      timeout: 5000,
      forceNew: true, // Force new connection each time
      transports: ['websocket'], // Use only websocket transport
    });

    // Connect and wait for connection
    const connectPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for WebSocket connection'));
      }, 5000);

      client.on('connect', () => {
        clearTimeout(timeout);
        resolve();
      });

      client.on('connect_error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`WebSocket connection failed: ${error.message}`));
      });
    });

    client.connect();
    await connectPromise;
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    // Properly disconnect client
    if (client) {
      if (client.connected) {
        client.disconnect();
      }
      client.removeAllListeners(); // Remove all event listeners
    }
    
    jest.clearAllMocks();
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('Connection and Authentication', () => {
    it('should connect successfully with valid JWT token', async () => {
      const testClient = Client('http://localhost:3002', {
        extraHeaders: {
          cookie: 'jwt=mock-jwt-token',
        },
        timeout: 5000,
        forceNew: true,
        transports: ['websocket'],
      });

      try {
        const connectPromise = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Timeout waiting for connected event'));
          }, 10000);

          testClient.on('connected', (data) => {
            clearTimeout(timeout);
            expect(data.message).toBe('WebSocket connected');
            resolve();
          });

          testClient.on('connect_error', (error) => {
            clearTimeout(timeout);
            reject(new Error(`Connection error: ${error.message}`));
          });
        });

        testClient.connect();
        await connectPromise;
        expect(testClient.connected).toBe(true);
      } finally {
        // Ensure cleanup
        if (testClient.connected) {
          testClient.disconnect();
        }
        testClient.removeAllListeners();
      }
    });

    it('should emit sprint:get_all on connection', async () => {
      const testClient = Client('http://localhost:3002', {
        extraHeaders: {
          cookie: 'jwt=mock-jwt-token',
        },
        timeout: 5000,
        forceNew: true,
        transports: ['websocket'],
      });

      try {
        const sprintPromise = new Promise<any>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Timeout waiting for sprint:get_all event'));
          }, 10000);

          testClient.on('sprint:get_all', (data) => {
            clearTimeout(timeout);
            resolve(data);
          });

          testClient.on('connect_error', (error) => {
            clearTimeout(timeout);
            reject(new Error(`Connection error: ${error.message}`));
          });
        });

        testClient.connect();
        const sprints = await sprintPromise;
        expect(sprints).toEqual([{
          ...mockSprint,
          createdAt: mockSprint.createdAt.toISOString(),
        }]);
      } finally {
        if (testClient.connected) {
          testClient.disconnect();
        }
        testClient.removeAllListeners();
      }
    });

    it('should handle authentication failure', async () => {
      const invalidClient = Client('http://localhost:3002', {
        extraHeaders: {
          cookie: 'jwt=invalid-token',
        },
        timeout: 5000,
        forceNew: true,
        transports: ['websocket'],
      });

      try {
        const authErrorPromise = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Timeout waiting for auth error'));
          }, 10000);

          invalidClient.on('auth:error', (data) => {
            clearTimeout(timeout);
            expect(data.message).toBe('Authentication failed');
            resolve();
          });

          invalidClient.on('connect_error', () => {
            clearTimeout(timeout);
            resolve(); // Connection error is also acceptable for auth failure
          });
        });

        invalidClient.connect();
        await authErrorPromise;
      } finally {
        if (invalidClient.connected) {
          invalidClient.disconnect();
        }
        invalidClient.removeAllListeners();
      }
    });
  });

  describe('Task Operations', () => {
    it('should create a task successfully', async () => {
      const taskData = {
        title: 'New Task',
        hours: 4,
        sprintId: 'sprint-1',
        description: 'New task description',
      };

      const createPromise = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for task:create response'));
        }, 5000);

        client.on('task:create', (data) => {
          clearTimeout(timeout);
          resolve(data);
        });
      });

      client.emit('task:create', taskData);
      const result = await createPromise;

      expect(result.result).toEqual(mockTask);
      expect(taskService.createTask).toHaveBeenCalledWith({
        title: taskData.title,
        hours: taskData.hours,
        sprintId: taskData.sprintId,
        description: taskData.description,
        parentId: undefined,
        assignedTo: undefined,
      });
    });

    it('should get tasks by index', async () => {
      const taskData = {
        sprintId: 'sprint-1',
        index: 0,
        limit: 5,
        isForward: true,
      };

      const getPromise = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for task:get_by_index response'));
        }, 5000);

        client.on('task:get_by_index', (data) => {
          clearTimeout(timeout);
          resolve(data);
        });
      });

      client.emit('task:get_by_index', taskData);
      const result = await getPromise;

      expect(result.tasks).toEqual([{
        ...mockTask,
        assigneeName: null,
      }]);
      expect(result.sprintId).toBe(taskData.sprintId);
      expect(result.pagination).toBeDefined();
      expect(taskService.getAllTasksBySprintWithIndex).toHaveBeenCalledWith(taskData);
    });

    it('should update task status', async () => {
      const statusData = {
        id: 'task-1',
        status: 'IN_PROGRESS',
      };

      const updatePromise = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for task:set_status response'));
        }, 5000);

        client.on('task:set_status', (data) => {
          clearTimeout(timeout);
          resolve(data);
        });
      });

      client.emit('task:set_status', statusData);
      const result = await updatePromise;

      expect(result.result).toEqual({
        ...mockTask,
        updated: true,
        message: 'Status updated successfully',
        assigneeName: null,
      });
      expect(taskService.updateTaskStatus).toHaveBeenCalledWith(
        statusData.id,
        statusData.status,
      );
    });

    it('should change task assignee', async () => {
      const assigneeData = {
        taskId: 'task-1',
        assigneeId: 'user-2',
      };

      const changePromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for task:refresh event'));
        }, 10000);

        client.on('task:refresh', (data) => {
          clearTimeout(timeout);
          expect(data.taskId).toBe(assigneeData.taskId);
          expect(data.new_assignee).toBe(assigneeData.assigneeId);
          expect(data.action).toBe('assignee_updated');
          resolve();
        });
      });

      client.emit('task:change_assignee', assigneeData);
      await changePromise;

      expect(prismaService.task.update).toHaveBeenCalledWith({
        where: { id: assigneeData.taskId },
        data: { assignedTo: assigneeData.assigneeId },
        include: { sprint: true },
      });
    });

    it('should delete a task', async () => {
      const deleteData = {
        taskId: 'task-1',
      };

      const deletePromise = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for task:request_delete response'));
        }, 5000);

        client.on('task:request_delete', (data) => {
          clearTimeout(timeout);
          resolve(data);
        });
      });

      const refreshPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for task:deleted event'));
        }, 5000);

        client.on('task:deleted', (data) => {
          clearTimeout(timeout);
          expect(data.taskId).toBe(deleteData.taskId);
          resolve();
        });
      });

      client.emit('task:request_delete', deleteData);
      const result = await deletePromise;
      await refreshPromise;

      expect(result.result).toEqual({
        id: mockTask.id,
        deleted: true,
        sprintId: mockTask.sprintId,
      });
      expect(taskService.deleteTask).toHaveBeenCalledWith(deleteData.taskId);
    });
  });

  describe('Sprint Operations', () => {
    it('should create a sprint successfully', async () => {
      const sprintData = {
        name: 'New Sprint',
      };

      const createPromise = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for sprint:create response'));
        }, 5000);

        client.on('sprint:create', (data) => {
          clearTimeout(timeout);
          resolve(data);
        });
      });

      const getAllPromise = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for sprint:get_all response'));
        }, 5000);

        client.on('sprint:get_all', (data) => {
          clearTimeout(timeout);
          resolve(data);
        });
      });

      client.emit('sprint:create', sprintData);
      const result = await createPromise;
      const allSprints = await getAllPromise;

      expect(result.result).toEqual({
        ...mockSprint,
        createdAt: mockSprint.createdAt.toISOString(),
      });
      expect(allSprints).toEqual([{
        ...mockSprint,
        createdAt: mockSprint.createdAt.toISOString(),
      }]);
      expect(sprintService.create).toHaveBeenCalledWith(sprintData.name);
    });

    it('should update sprint status', async () => {
      const statusData = {
        id: 'sprint-1',
        status: 'IN_PROGRESS',
      };

      const updatePromise = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for sprint:set_status response'));
        }, 5000);

        client.on('sprint:set_status', (data) => {
          clearTimeout(timeout);
          resolve(data);
        });
      });

      client.emit('sprint:set_status', statusData);
      const result = await updatePromise;

      expect(result.result).toEqual({
        ...mockSprint,
        createdAt: mockSprint.createdAt.toISOString(),
      });
      expect(sprintService.updateSprintStatus).toHaveBeenCalledWith(
        statusData.id,
        statusData.status,
      );
    });

    it('should change sprint name', async () => {
      const nameData = {
        id: 'sprint-1',
        name: 'Updated Sprint Name',
      };

      const changePromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for sprint:refresh event'));
        }, 5000);

        client.on('sprint:refresh', (data) => {
          clearTimeout(timeout);
          expect(data.sprintId).toBe(nameData.id);
          expect(data.new_name).toBe(nameData.name);
          expect(data.action).toBe('name_updated');
          resolve();
        });
      });

      client.emit('sprint:change_name', nameData);
      await changePromise;

      expect(sprintService.updateSprintName).toHaveBeenCalledWith(
        nameData.id,
        nameData.name,
      );
    });
  });

  describe('User Operations', () => {
    it('should get all users', async () => {
      const getPromise = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for user:get_all response'));
        }, 5000);

        client.on('user:get_all', (data) => {
          clearTimeout(timeout);
          resolve(data);
        });
      });

      client.emit('user:request_all', {});
      const result = await getPromise;

      expect(result.users).toEqual([mockUser]);
      expect(prismaService.user.findMany).toHaveBeenCalledWith({
        select: {
          id: true,
          name: true,
        },
        orderBy: {
          name: 'asc',
        },
      });
    });

    it('should handle online users', async () => {
      const onlinePromise = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for user:online_users response'));
        }, 5000);

        client.on('user:online_users', (data) => {
          clearTimeout(timeout);
          resolve(data);
        });
      });

      client.emit('user:request_online_users', {});
      const result = await onlinePromise;

      expect(result.users).toBeDefined();
      expect(result.count).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid task creation data', async () => {
      const invalidData = {
        title: '', // Invalid empty title
        hours: -1, // Invalid negative hours
        sprintId: '', // Invalid empty sprintId
      };

      const errorPromise = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for task:create error response'));
        }, 5000);

        client.on('task:create', (data) => {
          clearTimeout(timeout);
          resolve(data);
        });
      });

      client.emit('task:create', invalidData);
      const result = await errorPromise;

      expect(result.error).toBeDefined();
      expect(result.error).toContain('title is required');
    });

    it('should handle invalid sprint creation data', async () => {
      const invalidData = {
        name: '', // Invalid empty name
      };

      const errorPromise = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for sprint:create error response'));
        }, 5000);

        client.on('sprint:create', (data) => {
          clearTimeout(timeout);
          resolve(data);
        });
      });

      client.emit('sprint:create', invalidData);
      const result = await errorPromise;

      expect(result.error).toBeDefined();
      expect(result.error).toContain('name is required');
    });
  });

  describe('Real-time Events', () => {
    it('should emit task refresh events', async () => {
      const refreshPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for task:refresh event'));
        }, 5000);

        client.on('task:refresh', (data) => {
          clearTimeout(timeout);
          expect(data.sprintId).toBeDefined();
          expect(data.taskId).toBeDefined();
          expect(data.action).toBeDefined();
          resolve();
        });
      });

      // Trigger a task operation that emits refresh
      client.emit('task:set_status', {
        id: 'task-1',
        status: 'COMPLETED',
      });

      await refreshPromise;
    });

    it('should emit sprint refresh events', async () => {
      const refreshPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for sprint:refresh event'));
        }, 5000);

        client.on('sprint:refresh', (data) => {
          clearTimeout(timeout);
          expect(data.sprintId).toBeDefined();
          expect(data.action).toBeDefined();
          resolve();
        });
      });

      // Trigger a sprint operation that emits refresh
      client.emit('sprint:change_description', {
        id: 'sprint-1',
        description: 'Updated description',
      });

      await refreshPromise;
    });
  });
});