import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

// Domain Ports
import { ORDER_REPOSITORY } from '../domain/ports/order-repository.port';
import { PROCESSED_EVENT_REPOSITORY } from '../domain/ports/processed-event-repository.port';

// Application Ports
import { EVENT_PUBLISHER } from '../application/ports/event-publisher.port';
import { INVENTORY_SERVICE } from '../application/ports/inventory-service.port';
import { PAYMENT_SERVICE } from '../application/ports/payment-service.port';

// Application Handlers
import { CreateOrderHandler } from '../application/handlers/create-order.handler';
import { ConfirmPaymentHandler } from '../application/handlers/confirm-payment.handler';
import { CancelOrderHandler } from '../application/handlers/cancel-order.handler';
import { ShipOrderHandler } from '../application/handlers/ship-order.handler';
import { DeliverOrderHandler } from '../application/handlers/deliver-order.handler';
import { RefundOrderHandler } from '../application/handlers/refund-order.handler';
import { GetOrderByIdHandler } from '../application/handlers/get-order-by-id.handler';
import { GetOrdersByUserHandler } from '../application/handlers/get-orders-by-user.handler';

// Infrastructure — Persistence
import { OrderOrmEntity } from '../infrastructure/persistence/entities/order.orm-entity';
import { OrderItemOrmEntity } from '../infrastructure/persistence/entities/order-item.orm-entity';
import { ProcessedEventOrmEntity } from '../infrastructure/persistence/entities/processed-event.orm-entity';
import { OutboxEventOrmEntity } from '../infrastructure/persistence/entities/outbox-event.orm-entity';
import { TypeOrmOrderRepository } from '../infrastructure/persistence/repositories/typeorm-order.repository';
import { TypeOrmProcessedEventRepository } from '../infrastructure/persistence/repositories/typeorm-processed-event.repository';

// Infrastructure — Kafka
import { KafkaClientFactory } from '../infrastructure/kafka/kafka-client.factory';
import { KafkaEventPublisher } from '../infrastructure/kafka/kafka-event-publisher';
import { OutboxRelayService } from '../infrastructure/kafka/outbox-relay.service';
import { PaymentEventConsumer } from '../infrastructure/kafka/consumers/payment-event.consumer';
import { InventoryEventConsumer } from '../infrastructure/kafka/consumers/inventory-event.consumer';
import { CheckoutSagaOrchestrator } from '../infrastructure/kafka/saga/checkout-saga.orchestrator';

// Infrastructure — External Services
import { KafkaInventoryService } from '../infrastructure/external-services/kafka-inventory.service';
import { KafkaPaymentService } from '../infrastructure/external-services/kafka-payment.service';

// Infrastructure — Observability
import { OrderMetricsService, MetricsController } from '../infrastructure/observability';

// Interface Layer
import { OrderController } from '../interfaces/controllers/order.controller';
import { HealthController } from '../interfaces/controllers/health.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrderOrmEntity,
      OrderItemOrmEntity,
      ProcessedEventOrmEntity,
      OutboxEventOrmEntity,
    ]),
    ScheduleModule.forRoot(),
  ],
  controllers: [
    OrderController,
    HealthController,
    MetricsController,
  ],
  providers: [
    // Shared Kafka client
    KafkaClientFactory,

    // Port bindings
    {
      provide: ORDER_REPOSITORY,
      useClass: TypeOrmOrderRepository,
    },
    {
      provide: PROCESSED_EVENT_REPOSITORY,
      useClass: TypeOrmProcessedEventRepository,
    },
    {
      provide: EVENT_PUBLISHER,
      useClass: KafkaEventPublisher,
    },
    {
      provide: INVENTORY_SERVICE,
      useClass: KafkaInventoryService,
    },
    {
      provide: PAYMENT_SERVICE,
      useClass: KafkaPaymentService,
    },

    // Command Handlers
    CreateOrderHandler,
    ConfirmPaymentHandler,
    CancelOrderHandler,
    ShipOrderHandler,
    DeliverOrderHandler,
    RefundOrderHandler,

    // Query Handlers
    GetOrderByIdHandler,
    GetOrdersByUserHandler,

    // Kafka Infrastructure
    OutboxRelayService,
    PaymentEventConsumer,
    InventoryEventConsumer,
    CheckoutSagaOrchestrator,

    // External Services
    KafkaInventoryService,
    KafkaPaymentService,

    // Observability
    OrderMetricsService,
  ],
})
export class OrderModule {}
