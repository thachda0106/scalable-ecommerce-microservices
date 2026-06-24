import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';

// Handlers
import { ReserveStockHandler } from './application/handlers/reserve-stock.handler';
import { ReleaseStockHandler } from './application/handlers/release-stock.handler';
import { ConfirmStockHandler } from './application/handlers/confirm-stock.handler';
import { ReplenishStockHandler } from './application/handlers/replenish-stock.handler';
import { GetInventoryHandler } from './application/handlers/get-inventory.handler';

// Ports
import { INVENTORY_REPOSITORY } from './domain/ports/inventory-repository.port';
import { STOCK_CACHE } from './domain/ports/stock-cache.port';
import { EVENT_PUBLISHER } from './application/ports/event-publisher.port';

// Infrastructure implementations
import { TypeOrmInventoryRepository } from './infrastructure/persistence/repositories/typeorm-inventory.repository';
import { RedisStockCacheAdapter } from './infrastructure/cache/redis-stock-cache.adapter';
import { RedisLockService } from './infrastructure/cache/redis-lock.service';
import { KafkaEventPublisher } from './infrastructure/messaging/kafka-event-publisher';
import { OutboxRelayService } from './infrastructure/messaging/outbox-relay.service';
import { OrderEventConsumer } from './infrastructure/messaging/order-event-consumer';
import { ReservationExpiryWorker } from './infrastructure/jobs/reservation-expiry.worker';
import { RetryPolicy } from './infrastructure/resilience/retry.policy';
import { CircuitBreaker } from './infrastructure/resilience/circuit-breaker';

// ORM entities
import { ProductInventoryOrmEntity } from './infrastructure/persistence/entities/product-inventory.orm-entity';
import { StockReservationOrmEntity } from './infrastructure/persistence/entities/stock-reservation.orm-entity';
import { StockMovementOrmEntity } from './infrastructure/persistence/entities/stock-movement.orm-entity';
import { OutboxEventOrmEntity } from './infrastructure/persistence/entities/outbox-event.orm-entity';
import { InboxEventEntity, Logger } from '@ecommerce/core';

// Inbox infrastructure
import { InboxSchedulerService } from './infrastructure/messaging/inbox-scheduler.service';

// Controller
import { InventoryController } from './interfaces/controllers/inventory.controller';

@Module({
  imports: [
    CqrsModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([
      ProductInventoryOrmEntity,
      StockReservationOrmEntity,
      StockMovementOrmEntity,
      OutboxEventOrmEntity,
      InboxEventEntity,
    ]),
  ],
  controllers: [InventoryController],
  providers: [
    // CQRS Handlers
    ReserveStockHandler,
    ReleaseStockHandler,
    ConfirmStockHandler,
    ReplenishStockHandler,
    GetInventoryHandler,

    // Port bindings — Symbol → Concrete
    { provide: INVENTORY_REPOSITORY, useClass: TypeOrmInventoryRepository },
    { provide: STOCK_CACHE, useClass: RedisStockCacheAdapter },
    { provide: EVENT_PUBLISHER, useClass: KafkaEventPublisher },

    // Infrastructure services
    RedisLockService,
    OutboxRelayService,
    OrderEventConsumer,
    ReservationExpiryWorker,
    InboxSchedulerService,

    // Resilience
    RetryPolicy,
    { provide: CircuitBreaker, useFactory: (logger: Logger) => new CircuitBreaker(logger, 5, 30000), inject: [Logger] },
  ],
  exports: [INVENTORY_REPOSITORY],
})
export class InventoryModule {}
