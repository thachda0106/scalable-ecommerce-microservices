import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  Logger,
  initTracing,
  GlobalExceptionFilter,
  HttpLoggingInterceptor,
  MetricsInterceptor,
} from '@ecommerce/core';
import { ValidationPipe } from '@nestjs/common';

initTracing('notification-service');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(
    new HttpLoggingInterceptor(),
    new MetricsInterceptor('notification-service'),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
