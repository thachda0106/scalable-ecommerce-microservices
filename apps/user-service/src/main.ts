import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { DomainExceptionFilter } from './interfaces/filters/domain-exception.filter';

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

  // Global exception filter for domain errors → HTTP status mapping
  app.useGlobalFilters(new DomainExceptionFilter());

  // Enable graceful shutdown — ensures OnModuleDestroy hooks fire (Kafka)
  app.enableShutdownHooks();

  const port = process.env.PORT || 3003;
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`User service running on port ${port}`);
}
bootstrap();
