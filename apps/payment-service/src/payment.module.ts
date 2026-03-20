import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { TerminusModule } from '@nestjs/terminus';
import {
  PrometheusModule,
  makeCounterProvider,
  makeHistogramProvider,
} from '@willsoto/nestjs-prometheus';

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
import { MetricsService } from './infrastructure/observability/metrics.service';

// Interfaces
import { PaymentController } from './interfaces/controllers/payment.controller';
import { HealthController } from './interfaces/controllers/health.controller';
import { ServiceAuthGuard } from './interfaces/guards/service-auth.guard';

const CommandHandlers = [ProcessPaymentHandler, RefundPaymentHandler];
const QueryHandlers = [GetPaymentByIdHandler, GetPaymentsByOrderHandler];

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TerminusModule,
    PrometheusModule.register({
      path: '/metrics',
    }),
    TypeOrmModule.forFeature([
      PaymentOrmEntity,
      OutboxEventOrmEntity,
      ProcessedEventOrmEntity,
    ]),
  ],
  controllers: [PaymentController, HealthController],
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
    MetricsService,
    ServiceAuthGuard,

    // ── Prometheus Metric Providers ──────────────────────────────
    makeCounterProvider({
      name: 'payment_processing_total',
      help: 'Total payment processing attempts',
      labelNames: ['provider'],
    }),
    makeCounterProvider({
      name: 'payment_success_total',
      help: 'Total successful payments',
      labelNames: ['provider'],
    }),
    makeCounterProvider({
      name: 'payment_failure_total',
      help: 'Total failed payments',
      labelNames: ['provider', 'reason'],
    }),
    makeHistogramProvider({
      name: 'payment_processing_duration_seconds',
      help: 'Payment processing duration in seconds',
      labelNames: ['provider'],
      buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    }),
  ],
  exports: [],
})
export class PaymentModule {}
