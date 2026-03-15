import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { AppModule } from './app.module';
import { LoggerService } from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const configService = app.get(ConfigService);

  app.useLogger(app.get<LoggerService>(Logger));

  app.enableCors({
    origin: configService.get<string>('gateway.corsOrigin', '*'),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  const httpAdapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(new AllExceptionsFilter(httpAdapterHost));

  app.useGlobalInterceptors(new LoggingInterceptor());

  // ── Swagger ────────────────────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('E-Commerce API Gateway')
    .setDescription(
      'Single entry point for all e-commerce microservices. ' +
        'Routes prefixed with 🔓 are public (no token required). ' +
        'All other routes require a valid Bearer JWT.',
    )
    .setVersion('1.0')
    .setContact('Platform Team', '', 'platform@ecommerce.local')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT token issued by POST /auth/login',
      },
      'jwt',
    )
    .addTag('Health', 'Liveness and readiness probes')
    .addTag('Auth', 'Authentication — login, register, token refresh (public)')
    .addTag('Products', 'Product catalogue — browse and search (public)')
    .addTag('Search', 'Full-text search (public)')
    .addTag('Users', 'User profile management (protected)')
    .addTag('Cart', 'Shopping cart (protected)')
    .addTag('Orders', 'Order lifecycle (protected)')
    .addTag('Inventory', 'Stock management (protected)')
    .addTag('Payments', 'Payment processing (protected)')
    .addTag('Notifications', 'User notifications (protected)')
    .addTag('Aggregation', 'BFF aggregation endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true, // keeps the token between page reloads
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'E-Commerce API Docs',
  });
  // ────────────────────────────────────────────────────────────────────────────

  const port = configService.get<number>('gateway.port', 3000);
  await app.listen(port);
}
void bootstrap();
