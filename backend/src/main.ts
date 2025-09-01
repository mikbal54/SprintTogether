import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AsyncApiDocumentBuilder, AsyncApiModule } from 'nestjs-asyncapi';
import cookieParser from 'cookie-parser';
import { writeFileSync } from 'fs';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable cookie parsing for JWT extraction from cookies
  app.use(cookieParser());

  // Allow CORS from local frontend with credentials (cookies)
  app.enableCors({
    origin: 'http://localhost:5173',
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

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
