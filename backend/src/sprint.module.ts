import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SprintService } from './sprint.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from './redis.service';
import { ConfigService } from './config.service';

@Module({
  imports: [ConfigModule],
  providers: [SprintService, PrismaService, RedisService, ConfigService],
  exports: [SprintService],
})
export class SprintModule {}



