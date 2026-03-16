import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { Logger, initTracing } from '@ecommerce/core';
import { DomainExceptionFilter } from './interfaces/filters/domain-exception.filter';

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

  // Global exception filter for domain errors
  app.useGlobalFilters(new DomainExceptionFilter());

  await app.listen(process.env.PORT ?? 3004);
}
bootstrap();
