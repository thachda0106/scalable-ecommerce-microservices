import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@ecommerce/core';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  // Global validation pipe — enforces DTO constraints across all routes
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true, // auto-transform payloads to DTO class instances
      whitelist: true, // strip unknown properties
      forbidNonWhitelisted: false,
    }),
  );

  // Enable graceful shutdown — ensures OnModuleDestroy hooks fire (Redis, Kafka)
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3004);
}
bootstrap();
