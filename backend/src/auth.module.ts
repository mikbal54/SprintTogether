import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { AuthController } from './auth.controller';
import {Auth0Strategy} from './auth0.strategy'
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from './redis.service';
import { ConfigService as CustomConfigService } from './config.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule, // provides ConfigService
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'), 
        signOptions: { expiresIn: '15m' }, // Short-lived access token with refresh token support
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy, Auth0Strategy, PrismaService, RedisService, CustomConfigService],
  controllers: [AuthController],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}