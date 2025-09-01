import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SprintController } from './sprint.controller.js';
import { SprintService } from './sprint.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from './redis.service.js';
import { ConfigService } from './config.service.js';

@Module({
  imports: [ConfigModule],
  controllers: [SprintController],
  providers: [SprintService, PrismaService, RedisService, ConfigService],
  exports: [SprintService],
})
export class SprintModule {}



