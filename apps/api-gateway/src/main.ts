import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@ecommerce/core';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const configService = app.get(ConfigService);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  app.useLogger(app.get(Logger as any));

  app.enableCors({
    origin: configService.get<string>('gateway.corsOrigin', '*'),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  const httpAdapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(new AllExceptionsFilter(httpAdapterHost));

  app.useGlobalInterceptors(new LoggingInterceptor());

  const port = configService.get<number>('gateway.port', 3000);
  await app.listen(port);
}
void bootstrap();
