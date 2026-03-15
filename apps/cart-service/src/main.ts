import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@ecommerce/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { initTracing } from '@ecommerce/core';
import { ResponseInterceptor } from './interfaces/interceptors/response.interceptor';

// Initialize OpenTelemetry tracing BEFORE NestFactory.create
initTracing('cart-service');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  // API versioning — all routes prefixed with /v1 by default
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Global validation pipe — enforces DTO constraints across all routes
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true, // auto-transform payloads to DTO class instances
      whitelist: true, // strip unknown properties
      forbidNonWhitelisted: true, // reject requests with unknown properties
    }),
  );

  // Global response interceptor — wraps all responses in { success, data, timestamp }
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Enable graceful shutdown — ensures OnModuleDestroy hooks fire (Redis, Kafka)
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3004);
}
bootstrap();
