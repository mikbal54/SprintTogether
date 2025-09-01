import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TaskService } from './task.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from './redis.service';
import { SprintService } from './sprint.service';
import { ConfigService } from './config.service';

@Module({
  imports: [ConfigModule],
  providers: [TaskService, PrismaService, RedisService, SprintService, ConfigService],
  exports: [TaskService],
})
export class TaskModule {}


