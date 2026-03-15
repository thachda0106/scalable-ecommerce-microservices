import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { HttpModule } from '@nestjs/axios';
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
import { CART_EVENTS_PRODUCER } from './application/ports/cart-events.port';

// Infrastructure Adapters
import { InMemoryCartRepository } from './infrastructure/repositories/cart.repository';
import { CartCacheRepository } from './infrastructure/redis/cart-cache.repository';
import { CartEventsProducer } from './infrastructure/kafka/cart-events.producer';

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
  imports: [CqrsModule, HttpModule],
  controllers: [CartController],
  providers: [
    // CQRS handlers
    ...commandHandlers,
    ...queryHandlers,

    // Port → Adapter bindings (Dependency Inversion)
    { provide: CART_REPOSITORY, useClass: InMemoryCartRepository },
    { provide: CART_CACHE, useClass: CartCacheRepository },
    { provide: CART_EVENTS_PRODUCER, useClass: CartEventsProducer },

    // Redis client factory
    {
      provide: 'REDIS_CLIENT',
      useFactory: (): Redis => {
        return new Redis({
          host: process.env.REDIS_HOST ?? 'localhost',
          port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
          lazyConnect: true,
        });
      },
    },

    // HTTP clients for external service integration
    ProductServiceClient,
    InventoryServiceClient,
  ],
})
export class CartModule {}
