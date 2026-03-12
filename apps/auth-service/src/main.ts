import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import { Logger } from "@ecommerce/core";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  app.useLogger(app.get(Logger as any));

  // Global input validation — strips unknown properties, enforces DTO rules
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS — allow configurable origin whitelist
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",")
    : "*";
  app.enableCors({ origin: allowedOrigins });

  // Graceful shutdown
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
