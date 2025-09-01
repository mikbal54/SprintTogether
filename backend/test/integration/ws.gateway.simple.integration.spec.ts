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

describe('WebSocket Gateway Simple Integration Tests', () => {
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
        getAll: jest.fn().mockResolvedValue([mockSprint]),
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
    await app.listen(3003); // Use different port to avoid conflicts

    const gateway = app.get<WsGateway>(WsGateway);
    server = gateway.server;
    prismaService = app.get<PrismaService>(PrismaService);
    redisService = app.get<RedisService>(RedisService);
    jwtService = app.get<JwtService>(JwtService);
    taskService = app.get<TaskService>(TaskService);
    sprintService = app.get<SprintService>(SprintService);

    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterAll(async () => {
    if (client) {
      client.close();
    }
    
    if (server) {
      server.close();
    }
    
    await app.close();
    
    // Wait for all connections to close
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    // Reset JWT mock
    (jwtService.verify as jest.Mock).mockImplementation((token) => {
      if (token === 'mock-jwt-token') {
        return mockJwtPayload;
      }
      throw new Error('Invalid token');
    });

    // Create a new client for each test
    client = Client('http://localhost:3003', {
      extraHeaders: {
        cookie: 'jwt=mock-jwt-token',
      },
      timeout: 5000,
    });

    // Set up event listeners for connection events
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

    // Connect the client
    client.connect();
    
    // Wait for connection to be established
    await connectPromise;

    // Wait a bit for the server to process the connection
    await new Promise(resolve => setTimeout(resolve, 100));
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

  describe('Basic Operations', () => {
    it('should connect successfully', async () => {
      expect(client.connected).toBe(true);
    });

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
      expect(taskService.getAllTasksBySprintWithIndex).toHaveBeenCalledWith(taskData);
    });

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

      client.emit('sprint:create', sprintData);
      const result = await createPromise;

      expect(result.result).toEqual({
        ...mockSprint,
        createdAt: mockSprint.createdAt.toISOString(),
      });
      expect(sprintService.create).toHaveBeenCalledWith(sprintData.name);
    });
  });
});
