import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WsGateway } from './ws.gateway';
import { WsJwtGuard } from './ws-jwt.guard';
import { SprintModule } from './sprint.module';
import { TaskModule } from './task.module';
import { RedisService } from './redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtStrategy } from './jwt.strategy';
import { ConfigService as CustomConfigService } from './config.service';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'), 
        signOptions: { expiresIn: '15m' },
      }),
    }),
    SprintModule,
    TaskModule,
  ],
  providers: [
    WsGateway,
    WsJwtGuard,
    RedisService,
    PrismaService,
    JwtStrategy,
    CustomConfigService,
  ],
  exports: [WsGateway],
})
export class WsModule {}
