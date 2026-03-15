import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { DomainExceptionFilter } from './interfaces/filters/domain-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new DomainExceptionFilter());

  const port = process.env.PORT ?? 3006;
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`Inventory service listening on port ${port}`);
}
bootstrap();
