import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, initTracing } from '@ecommerce/core';
import { ValidationPipe } from '@nestjs/common';

initTracing('notification-service');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
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
