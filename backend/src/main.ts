import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AsyncApiDocumentBuilder, AsyncApiModule } from 'nestjs-asyncapi';
import cookieParser from 'cookie-parser';
import { writeFileSync } from 'fs';
import { ConfigService } from './config.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Print FRONTEND_URL on startup
  const frontendUrl = configService.getFrontendUrl();
  const allowedOrigins = configService.getFrontendOrigins();
  console.log('🚀 SprintTogether Backend Starting...');
  console.log(`📱 FRONTEND_URL: ${frontendUrl}`);
  console.log(`🌐 CORS Origins: ${allowedOrigins.join(', ')}`);

  // Enable cookie parsing for JWT extraction from cookies
  app.use(cookieParser());

  // Allow CORS from frontend with credentials (cookies)
  app.enableCors({
    origin: (origin, callback) => {
      console.log(`🔍 CORS Request from origin: ${origin}`);
      console.log(`🔍 Allowed origins: ${allowedOrigins.join(', ')}`);
      
      if (!origin || allowedOrigins.includes(origin)) {
        console.log(`✅ CORS allowed for origin: ${origin}`);
        callback(null, true);
      } else {
        console.log(`❌ CORS blocked for origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: 'Content-Type, Authorization',
  });

    // Swagger config
    // by default i made api/docs only accesible in dev
    // is this what we want? if we are developing a SaaS this can be accesed with authorization. or deploy to another host?
    if (process.env.NODE_ENV !== 'production') {
      const config = new DocumentBuilder()
        .setTitle('API')
        .setVersion('1.0')
        .addBearerAuth()
        .build();
      const document = SwaggerModule.createDocument(app, config);
      SwaggerModule.setup('api/docs', app, document);

      // AsyncAPI config for WebSocket documentation
      if (process.env.NODE_ENV !== 'production') {
        const asyncApiOptions = new AsyncApiDocumentBuilder()
          .setTitle('SprintTogether WebSocket API')
          .setDescription('Real-time WebSocket API for SprintTogether application')
          .setVersion('1.0')
          .setDefaultContentType('application/json')
          .addSecurity('jwt', { type: 'http', scheme: 'bearer' })
          .addServer('sprinttogether-ws', {
            url: `ws://localhost:${process.env.PORT ?? 3000}`,
            protocol: 'socket.io',
          })
          .build();

        const asyncapiDocument = await AsyncApiModule.createDocument(app, asyncApiOptions);
        await AsyncApiModule.setup('api/async-docs', app, asyncapiDocument);


      }

      
    }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  
  console.log(`✅ Server running on port ${port}`);
  console.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
  console.log(`🔌 WebSocket Documentation: http://localhost:${port}/api/async-docs`);
}
bootstrap();
