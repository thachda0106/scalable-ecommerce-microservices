import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  initTracing,
  GlobalExceptionFilter,
  HttpLoggingInterceptor,
  Logger,
  MetricsInterceptor,
} from '@ecommerce/core';

initTracing('order-service');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  const logger = app.get(Logger);
  app.useGlobalFilters(new GlobalExceptionFilter(logger));
  app.useGlobalInterceptors(
    new HttpLoggingInterceptor(logger),
    new MetricsInterceptor('order-service'),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
