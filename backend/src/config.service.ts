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

  getFrontendUrl(): string {
    return process.env.FRONTEND_URL || 'http://localhost:5173';
  }

  getFrontendOrigins(): string[] {
    const frontendUrl = this.getFrontendUrl();
    const url = new URL(frontendUrl);
    
    // Check if the original URL string contains explicit port
    const hasExplicitPort = frontendUrl.includes(':80') || frontendUrl.includes(':443');
    const isDefaultPort = (url.protocol === 'http:' && (url.port === '' || url.port === '80')) ||
                         (url.protocol === 'https:' && (url.port === '' || url.port === '443'));
    
    console.log(`🔍 Debug - frontendUrl: ${frontendUrl}`);
    console.log(`🔍 Debug - hasExplicitPort: ${hasExplicitPort}`);
    console.log(`🔍 Debug - isDefaultPort: ${isDefaultPort}`);
    console.log(`🔍 Debug - url.port: "${url.port}"`);
    
    // Create array of possible origins to handle port variations
    const origins = [frontendUrl];
    
    // For HTTP/HTTPS, handle port variations
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      const defaultPort = url.protocol === 'http:' ? '80' : '443';
      
      // If original URL has explicit default port, also add version without port
      if (hasExplicitPort && isDefaultPort) {
        const urlWithoutPort = `${url.protocol}//${url.hostname}`;
        console.log(`🔍 Debug - Adding urlWithoutPort: ${urlWithoutPort}`);
        origins.push(urlWithoutPort);
      }
      // If original URL has no explicit port, also add version with explicit port
      else if (!hasExplicitPort && isDefaultPort) {
        const urlWithPort = `${url.protocol}//${url.hostname}:${defaultPort}`;
        console.log(`🔍 Debug - Adding urlWithPort: ${urlWithPort}`);
        origins.push(urlWithPort);
      }
      // If URL has non-default port, also add version without port
      else if (url.port && url.port !== defaultPort) {
        const urlWithoutPort = `${url.protocol}//${url.hostname}`;
        console.log(`🔍 Debug - Adding urlWithoutPort (non-default port): ${urlWithoutPort}`);
        origins.push(urlWithoutPort);
      }
    }
    
    console.log(`🔍 Debug - Final origins before dedup: ${JSON.stringify(origins)}`);
    
    // Remove duplicates and return
    const finalOrigins = [...new Set(origins)];
    console.log(`🔍 Debug - Final origins after dedup: ${JSON.stringify(finalOrigins)}`);
    
    return finalOrigins;
  }
}
