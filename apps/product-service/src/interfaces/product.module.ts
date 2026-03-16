import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import Redis from 'ioredis';

// Domain Ports
import { PRODUCT_REPOSITORY } from '../domain/ports/product-repository.port';

// Application Ports
import { EVENT_PUBLISHER } from '../application/ports/event-publisher.port';
import { PRODUCT_CACHE } from '../application/ports/product-cache.port';

// Application Handlers
import { CreateProductHandler } from '../application/handlers/create-product.handler';
import { UpdateProductHandler } from '../application/handlers/update-product.handler';
import { DeleteProductHandler } from '../application/handlers/delete-product.handler';
import { UpdateProductStatusHandler } from '../application/handlers/update-product-status.handler';
import { GetProductByIdHandler } from '../application/handlers/get-product-by-id.handler';
import { GetProductsHandler } from '../application/handlers/get-products.handler';

// Infrastructure — Persistence
import { ProductOrmEntity } from '../infrastructure/persistence/entities/product.orm-entity';
import { OutboxEventOrmEntity } from '../infrastructure/persistence/entities/outbox-event.orm-entity';
import { TypeOrmProductRepository } from '../infrastructure/persistence/repositories/typeorm-product.repository';

// Infrastructure — Kafka
import { KafkaClientFactory } from '../infrastructure/kafka/kafka-client.factory';
import { KafkaEventPublisher } from '../infrastructure/kafka/kafka-event-publisher';
import { OutboxRelayService } from '../infrastructure/kafka/outbox-relay.service';

// Infrastructure — Redis
import { ProductCacheRepository } from '../infrastructure/redis/product-cache.repository';

// Infrastructure — Observability
import { ProductMetricsService, MetricsController } from '../infrastructure/observability';

// Interface Layer
import { ProductController } from '../interfaces/controllers/product.controller';
import { HealthController } from '../interfaces/controllers/health.controller';
import { ServiceAuthGuard } from '../interfaces/guards/service-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProductOrmEntity, OutboxEventOrmEntity]),
    ScheduleModule.forRoot(),
  ],
  controllers: [ProductController, HealthController, MetricsController],
  providers: [
    // Shared Kafka client
    KafkaClientFactory,

    // Redis client
    {
      provide: 'REDIS_CLIENT',
      useFactory: () => {
        return new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
          lazyConnect: true,
        });
      },
    },

    // Port bindings
    {
      provide: PRODUCT_REPOSITORY,
      useClass: TypeOrmProductRepository,
    },
    {
      provide: EVENT_PUBLISHER,
      useClass: KafkaEventPublisher,
    },
    {
      provide: PRODUCT_CACHE,
      useClass: ProductCacheRepository,
    },

    // Command Handlers
    CreateProductHandler,
    UpdateProductHandler,
    DeleteProductHandler,
    UpdateProductStatusHandler,

    // Query Handlers
    GetProductByIdHandler,
    GetProductsHandler,

    // Kafka Infrastructure
    OutboxRelayService,

    // Observability
    ProductMetricsService,

    // Guards
    ServiceAuthGuard,
  ],
})
export class ProductModule {}
