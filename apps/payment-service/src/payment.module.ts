import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule } from '@nestjs/schedule';

// Application Ports / Handlers
import { ProcessPaymentHandler } from './application/handlers/process-payment.handler';
import { RefundPaymentHandler } from './application/handlers/refund-payment.handler';
import { GetPaymentByIdHandler } from './application/handlers/get-payment-by-id.handler';
import { GetPaymentsByOrderHandler } from './application/handlers/get-payments-by-order.handler';

// Domain Ports mapping tokens
import { PAYMENT_REPOSITORY } from './domain/ports/payment-repository.port';
import { EVENT_PUBLISHER } from './application/ports/event-publisher.port';
import { PAYMENT_PROVIDER_FACTORY } from './application/ports/payment-provider-factory.port';

// Infrastructure
import { PaymentOrmEntity } from './infrastructure/persistence/entities/payment.orm-entity';
import { OutboxEventOrmEntity } from './infrastructure/persistence/entities/outbox-event.orm-entity';
import { ProcessedEventOrmEntity } from './infrastructure/persistence/entities/processed-event.orm-entity';
import { TypeOrmPaymentRepository } from './infrastructure/persistence/repositories/typeorm-payment.repository';
import { KafkaEventPublisher } from './infrastructure/kafka/kafka-event-publisher';
import { PaymentCommandConsumer } from './infrastructure/kafka/consumers/payment-command.consumer';
import { OutboxRelayService } from './infrastructure/kafka/outbox-relay.service';
import { KafkaClientFactory } from './infrastructure/kafka/kafka-client.factory';
import { PaymentProviderFactory } from './infrastructure/providers/payment-provider.factory';
import { MockProvider } from './infrastructure/providers/mock.provider';
import { StripeProvider } from './infrastructure/providers/stripe.provider';
import { PayPalProvider } from './infrastructure/providers/paypal.provider';

// Interfaces
import { PaymentController } from './interfaces/controllers/payment.controller';

const CommandHandlers = [ProcessPaymentHandler, RefundPaymentHandler];
const QueryHandlers = [GetPaymentByIdHandler, GetPaymentsByOrderHandler];

@Module({
  imports: [
    CqrsModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([
      PaymentOrmEntity,
      OutboxEventOrmEntity,
      ProcessedEventOrmEntity,
    ]),
  ],
  controllers: [PaymentController],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    {
      provide: PAYMENT_REPOSITORY,
      useClass: TypeOrmPaymentRepository,
    },
    {
      provide: EVENT_PUBLISHER,
      useClass: KafkaEventPublisher,
    },
    {
      provide: PAYMENT_PROVIDER_FACTORY,
      useClass: PaymentProviderFactory,
    },
    MockProvider,
    StripeProvider,
    PayPalProvider,
    KafkaClientFactory,
    PaymentCommandConsumer,
    OutboxRelayService,
  ],
  exports: [],
})
export class PaymentModule {}
