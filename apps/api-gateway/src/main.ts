import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@ecommerce/core';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  app.useLogger(app.get(Logger as any));
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
