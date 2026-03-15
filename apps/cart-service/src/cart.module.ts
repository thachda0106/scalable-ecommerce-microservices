import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { HttpModule } from '@nestjs/axios';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import Redis from 'ioredis';

// Controllers
import { CartController } from './interfaces/controllers/cart.controller';

// Command Handlers
import { AddItemHandler } from './application/handlers/add-item.handler';
import { RemoveItemHandler } from './application/handlers/remove-item.handler';
import { ClearCartHandler } from './application/handlers/clear-cart.handler';
import { UpdateItemQuantityHandler } from './application/handlers/update-item-quantity.handler';

// Query Handlers
import { GetCartHandler } from './application/handlers/get-cart.handler';

// Port Tokens
import { CART_REPOSITORY } from './application/ports/cart-repository.port';
import { CART_CACHE } from './application/ports/cart-cache.port';
import { CART_OUTBOX } from './application/ports/cart-outbox.port';

// Infrastructure Adapters
import { RedisCartRepository } from './infrastructure/repositories/redis-cart.repository';
import { CartCacheRepository } from './infrastructure/redis/cart-cache.repository';
import { RedisOutboxRepository } from './infrastructure/redis/redis-outbox.repository';
import { OutboxRelayService } from './infrastructure/kafka/outbox-relay.service';

// HTTP Clients
import { ProductServiceClient } from './infrastructure/http/product-service.client';
import { InventoryServiceClient } from './infrastructure/http/inventory-service.client';

const commandHandlers = [
  AddItemHandler,
  RemoveItemHandler,
  ClearCartHandler,
  UpdateItemQuantityHandler,
];
const queryHandlers = [GetCartHandler];

@Module({
  imports: [
    CqrsModule,
    HttpModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
  ],
  controllers: [CartController],
  providers: [
    // Global rate limiting guard
    { provide: APP_GUARD, useClass: ThrottlerGuard },

    // CQRS handlers
    ...commandHandlers,
    ...queryHandlers,

    // Port → Adapter bindings (Dependency Inversion)
    { provide: CART_REPOSITORY, useClass: RedisCartRepository },
    { provide: CART_CACHE, useClass: CartCacheRepository },
    { provide: CART_OUTBOX, useClass: RedisOutboxRepository },

    // Outbox relay worker (publishes Redis Stream events to Kafka)
    OutboxRelayService,

    // Redis client factory
    {
      provide: 'REDIS_CLIENT',
      useFactory: (): Redis => {
        return new Redis({
          host: process.env.REDIS_HOST ?? 'localhost',
          port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
          lazyConnect: true,
          commandTimeout: 2000,
          connectTimeout: 5000,
          maxRetriesPerRequest: 1,
          enableReadyCheck: true,
          retryStrategy: (times) => Math.min(times * 100, 3000),
        });
      },
    },

    // HTTP clients for external service integration
    ProductServiceClient,
    InventoryServiceClient,
  ],
})
export class CartModule {}
