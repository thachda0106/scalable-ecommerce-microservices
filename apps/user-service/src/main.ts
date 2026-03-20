import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import {
  initTracing,
  GlobalExceptionFilter,
  HttpLoggingInterceptor,
  MetricsInterceptor,
} from '@ecommerce/core';

initTracing('user-service');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.setGlobalPrefix('api');

  // Global validation pipe
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
    new MetricsInterceptor('user-service'),
  );

  // Enable graceful shutdown — ensures OnModuleDestroy hooks fire (Kafka)
  app.enableShutdownHooks();

  const port = process.env.PORT || 3003;
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`User service running on port ${port}`);
}
void bootstrap();
