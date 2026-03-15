import { NestFactory } from '@nestjs/core';
import { ValidationPipe, LoggerService } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { Logger } from '@ecommerce/core';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get<LoggerService>(Logger));

  // Global input validation — strips unknown properties, enforces DTO rules
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS — allow configurable origin whitelist
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : '*';
  app.enableCors({ origin: allowedOrigins });

  // Graceful shutdown
  app.enableShutdownHooks();

  // Swagger API documentation
  const config = new DocumentBuilder()
    .setTitle('Auth Service API')
    .setDescription(
      'Authentication and identity management — JWT, OAuth, token rotation',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
