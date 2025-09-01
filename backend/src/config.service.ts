import { Injectable } from '@nestjs/common';

@Injectable()
export class ConfigService {
  getDatabaseUrl(): string {
    // Use DATABASE_URL if provided (Docker Compose will expand the variables)
    const dbUrl = process.env.DATABASE_URL || 
      `postgres://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@localhost:5432/${process.env.POSTGRES_DB}`;
    
    if (!dbUrl) {
      throw new Error('Database URL is not configured. Please set DATABASE_URL or individual POSTGRES_* variables.');
    }
    
    return dbUrl;
  }

  getRedisConfig() {
    return {
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
    };
  }
}
