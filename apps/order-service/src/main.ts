import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { initTracing } from '@ecommerce/core';

initTracing('order-service');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
