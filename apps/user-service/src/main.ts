import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import {
  initTracing,
  GlobalExceptionFilter,
  HttpLoggingInterceptor,
  Logger,
  MetricsInterceptor,
} from '@ecommerce/core';

initTracing('user-service');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  app.setGlobalPrefix('api');

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const logger = app.get(Logger);

  // Global exception filter and interceptors
  app.useGlobalFilters(new GlobalExceptionFilter(logger));
  app.useGlobalInterceptors(
    new HttpLoggingInterceptor(logger),
    new MetricsInterceptor('user-service'),
  );

  // Enable graceful shutdown — ensures OnModuleDestroy hooks fire (Kafka)
  app.enableShutdownHooks();

  const port = process.env.PORT || 3003;
  await app.listen(port);

  logger.log(`User service running on port ${port}`);
}
void bootstrap();
