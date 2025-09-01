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

// Set up test environment variables
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';

describe('WebSocket Gateway Basic Integration Tests', () => {
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

  // Create a mock JWT token for testing
  const mockJwtToken = 'mock-jwt-token';

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
          findMany: jest.fn().mockResolvedValue([]),
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({}),
          update: jest.fn().mockResolvedValue({}),
          delete: jest.fn().mockResolvedValue({}),
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        sprint: {
          findMany: jest.fn().mockResolvedValue([]),
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({}),
          update: jest.fn().mockResolvedValue({}),
          delete: jest.fn().mockResolvedValue({}),
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
        createTask: jest.fn().mockResolvedValue({
          id: 'task-1',
          title: 'Test Task',
          hours: 8,
          status: 'OPEN',
          sprintId: 'sprint-1',
        }),
        updateTaskStatus: jest.fn().mockResolvedValue({
          id: 'task-1',
          status: 'IN_PROGRESS',
          sprintId: 'sprint-1',
        }),
        getAllTasksBySprintWithIndex: jest.fn().mockResolvedValue({
          tasks: [],
          total: 0,
          currentIndex: 0,
          hasNext: false,
          hasPrev: false,
          startIndex: 0,
          endIndex: 0,
        }),
        invalidateSprintCache: jest.fn().mockResolvedValue(undefined),
      })
      .overrideProvider(SprintService)
      .useValue({
        create: jest.fn().mockResolvedValue({
          id: 'sprint-1',
          name: 'Test Sprint',
          status: 'OPEN',
        }),
        getAll: jest.fn().mockResolvedValue([]),
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
    await app.listen(3001); // Use different port to avoid conflicts

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
    jest.clearAllMocks();

    // Reset JWT mock
    (jwtService.verify as jest.Mock).mockImplementation((token) => {
      if (token === 'mock-jwt-token') {
        return mockJwtPayload;
      }
      throw new Error('Invalid token');
    });

    client = Client('http://localhost:3001', {
      extraHeaders: {
        cookie: 'jwt=mock-jwt-token',
      },
      timeout: 5000,
      forceNew: true,
      transports: ['websocket'],
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

  describe('Basic Connection', () => {
    it('should connect successfully with valid JWT token', async () => {
      const testClient = Client('http://localhost:3001', {
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
      const testClient = Client('http://localhost:3001', {
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
        expect(sprints).toEqual([]);
      } finally {
        if (testClient.connected) {
          testClient.disconnect();
        }
        testClient.removeAllListeners();
      }
    });
  });

  describe('Basic Task Operations', () => {
    it('should handle task creation request', async () => {
      const taskData = {
        title: 'Test Task',
        hours: 8,
        sprintId: 'sprint-1',
      };

      const createPromise = new Promise<any>((resolve) => {
        client.on('task:create', (data) => {
          resolve(data);
        });
      });

      client.emit('task:create', taskData);
      const result = await createPromise;

      expect(result.result).toBeDefined();
      expect(result.result.title).toBe('Test Task');
    });

    it('should handle task status update request', async () => {
      const statusData = {
        id: 'task-1',
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
    });
  });

  describe('Basic Sprint Operations', () => {
    it('should handle sprint creation request', async () => {
      const sprintData = {
        name: 'Test Sprint',
      };

      const createPromise = new Promise<any>((resolve) => {
        client.on('sprint:create', (data) => {
          resolve(data);
        });
      });

      client.emit('sprint:create', sprintData);
      const result = await createPromise;

      expect(result.result).toBeDefined();
      expect(result.result.name).toBe('Test Sprint');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid task creation data', async () => {
      const invalidData = {
        title: '', // Invalid empty title
        hours: -1, // Invalid negative hours
        sprintId: '', // Invalid empty sprintId
      };

      const errorPromise = new Promise<any>((resolve) => {
        client.on('task:create', (data) => {
          resolve(data);
        });
      });

      client.emit('task:create', invalidData);
      const result = await errorPromise;

      expect(result.error).toBeDefined();
      expect(result.error).toContain('title is required');
    });
  });
});
