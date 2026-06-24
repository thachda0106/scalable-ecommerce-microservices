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

initTracing('inventory-service');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  const logger = app.get(Logger);

  // Global exception filter and interceptors
  app.useGlobalFilters(new GlobalExceptionFilter(logger));
  app.useGlobalInterceptors(
    new HttpLoggingInterceptor(logger),
    new MetricsInterceptor('inventory-service'),
  );

  const port = process.env.PORT ?? 3006;
  await app.listen(port);

  logger.log(`Inventory service listening on port ${port}`);
}
bootstrap();
