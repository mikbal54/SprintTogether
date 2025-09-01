import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth.module.js';
import { TaskModule } from './task.module.js';
import { SprintModule } from './sprint.module.js';
import { WsModule } from './ws.module';
import { RedisService } from './redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from './config.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), //for .env file
    EventEmitterModule.forRoot(),
    AuthModule,
    TaskModule,
    SprintModule,
    WsModule,
  ],
  controllers: [AppController],
  providers: [AppService, ConfigService, RedisService, PrismaService],
})
export class AppModule {}
