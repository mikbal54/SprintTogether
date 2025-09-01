import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Server } from 'socket.io';
import Client from 'socket.io-client';
import { Socket } from 'socket.io-client';
import { WsGateway } from '../../src/ws.gateway';
import { SprintService } from '../../src/sprint.service';
import { TaskService } from '../../src/task.service';
import { RedisService } from '../../src/redis.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { WsJwtGuard } from '../../src/ws-jwt.guard';

export class TestWebSocketGateway {
  private app: INestApplication;
  private server: Server;
  private clients: Socket[] = [];

  async setup() {
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
          findUnique: jest.fn(),
          findMany: jest.fn(),
        },
        task: {
          findMany: jest.fn(),
          findUnique: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
          deleteMany: jest.fn(),
        },
        sprint: {
          findMany: jest.fn(),
          findUnique: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
        },
        $transaction: jest.fn(),
      })
      .overrideProvider(RedisService)
      .useValue({
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
        sadd: jest.fn(),
        srem: jest.fn(),
        smembers: jest.fn(),
        keys: jest.fn(),
      })
      .overrideProvider(JwtService)
      .useValue({
        verify: jest.fn(),
        sign: jest.fn(),
      })
      .compile();

    this.app = moduleFixture.createNestApplication();
    this.app.useWebSocketAdapter(new IoAdapter(this.app));
    await this.app.init();

    const gateway = this.app.get<WsGateway>(WsGateway);
    this.server = gateway.server;
  }

  async createClient(token?: string): Promise<Socket> {
    const client = Client(`http://localhost:3000`, {
      auth: {
        token,
      },
      extraHeaders: {
        cookie: token ? `jwt=${token}` : '',
      },
    });

    this.clients.push(client);
    return client;
  }

  async cleanup() {
    for (const client of this.clients) {
      client.close();
    }
    this.clients = [];
    await this.app.close();
  }

  getServer(): Server {
    return this.server;
  }
}
