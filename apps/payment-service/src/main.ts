import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import {
  Logger,
  initTracing,
  GlobalExceptionFilter,
  HttpLoggingInterceptor,
  MetricsInterceptor,
} from '@ecommerce/core';

initTracing('payment-service');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Use centralized logger
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  // Enable validation globally based on DTO decorators
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Global exception filter and interceptors
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(
    new HttpLoggingInterceptor(),
    new MetricsInterceptor('payment-service'),
  );

  await app.listen(process.env.PORT ?? 3004);
}
bootstrap();
