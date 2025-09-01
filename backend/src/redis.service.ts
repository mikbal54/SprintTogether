import { Injectable, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from './config.service';

@Injectable()
export class RedisService implements OnModuleInit {
  private client: Redis;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const redisConfig = this.configService.getRedisConfig();
    this.client = new Redis(redisConfig);
  }

  async get(key: string) {
    const value = await this.client.get(key);
    return value ? JSON.parse(value) : null;
  }

  async set(key: string, value: any, ttlSeconds?: number) {
    const str = JSON.stringify(value);
    if (ttlSeconds) {
      await this.client.set(key, str, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, str);
    }
  }

  async del(...keys: string[]): Promise<number> {
    return await this.client.del(...keys);
  }

  async keys(pattern: string): Promise<string[]> {
    return await this.client.keys(pattern);
  }

  // Set operations for managing online users
  async sadd(key: string, ...members: string[]): Promise<number> {
    return await this.client.sadd(key, ...members);
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    return await this.client.srem(key, ...members);
  }

  async smembers(key: string): Promise<string[]> {
    if (!this.client) {
      return [];
    }
    return await this.client.smembers(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async type(key: string): Promise<string> {
    return await this.client.type(key);
  }

  // Delete keys by pattern (for cache invalidation)
  async delByPattern(pattern: string): Promise<number> {
    try {
      // Use SCAN to find keys matching the pattern
      let cursor = '0';
      let deletedCount = 0;
      
      do {
        const result = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', '100');
        cursor = result[0];
        const keys = result[1];
        
        if (keys.length > 0) {
          const deleted = await this.client.del(...keys);
          deletedCount += deleted;
        }
      } while (cursor !== '0');
      
      return deletedCount;
    } catch (error) {
      console.error('Error deleting keys by pattern:', pattern, error);
      return 0;
    }
  }

  // Get keys by pattern (for debugging)
  async getKeysByPattern(pattern: string): Promise<string[]> {
    try {
      if (!this.client) {
        console.warn('Redis client not available for getKeysByPattern');
        return [];
      }
      
      let cursor = '0';
      const keys: string[] = [];
      
      do {
        const result = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', '100');
        if (!result || !Array.isArray(result) || result.length < 2) {
          console.warn('Invalid scan result:', result);
          break;
        }
        cursor = result[0];
        const foundKeys = result[1];
        if (Array.isArray(foundKeys)) {
          keys.push(...foundKeys);
        }
      } while (cursor !== '0');
      
      return keys;
    } catch (error) {
      console.error('Error getting keys by pattern:', pattern, error);
      return [];
    }
  }
}