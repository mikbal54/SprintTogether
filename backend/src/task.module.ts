import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TaskController } from './task.controller.js';
import { TaskService } from './task.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from './redis.service.js';
import { SprintService } from './sprint.service.js';
import { ConfigService } from './config.service.js';

@Module({
  imports: [ConfigModule],
  controllers: [TaskController],
  providers: [TaskService, PrismaService, RedisService, SprintService, ConfigService],
  exports: [TaskService],
})
export class TaskModule {}


