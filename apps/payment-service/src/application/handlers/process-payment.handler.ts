import { Inject, Logger } from '@nestjs/common';

import { ProcessPaymentCommand } from '../commands/process-payment.command';
import { Payment } from '../../domain/entities/payment.entity';
import { PaymentProviderEnum } from '../../domain/enums/payment-provider.enum';
import { PaymentStatusEnum } from '../../domain/value-objects/payment-status.vo';
import {
  PAYMENT_REPOSITORY,
  IPaymentRepository,
} from '../../domain/ports/payment-repository.port';
import {
  EVENT_PUBLISHER,
  IEventPublisher,
} from '../ports/event-publisher.port';
import {
  PAYMENT_PROVIDER_FACTORY,
  IPaymentProviderFactory,
} from '../ports/payment-provider-factory.port';
import { MetricsService } from '../../infrastructure/observability/metrics.service';

export class ProcessPaymentHandler {
  private readonly logger = new Logger(ProcessPaymentHandler.name);

  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepository: IPaymentRepository,
    @Inject(PAYMENT_PROVIDER_FACTORY)
    private readonly providerFactory: IPaymentProviderFactory,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
    private readonly metricsService: MetricsService,
  ) {}

  async execute(
    command: ProcessPaymentCommand,
  ): Promise<Record<string, unknown>> {
    const {
      orderId,
      userId,
      amountInCents,
      currency,
      provider: providerName,
      idempotencyKey,
    } = command;

    // 1. Idempotency check
    if (idempotencyKey) {
      const existing =
        await this.paymentRepository.findByIdempotencyKey(idempotencyKey);
      if (existing && existing.status.value === PaymentStatusEnum.SUCCESS) {
        this.logger.log(
          `Idempotent hit: payment for key ${idempotencyKey} already SUCCESS — returning existing`,
        );
        return existing.toJSON();
      }
    }

    // 2. Resolve provider
    const resolvedProvider = this.resolveProvider(providerName);
    this.metricsService.incrementProcessing(resolvedProvider);
    const endTimer = this.metricsService.startProcessingTimer(resolvedProvider);

    // 3. Create Payment aggregate
    const payment = Payment.create({
      orderId,
      userId,
      amountInCents,
      currency,
      provider: resolvedProvider,
      idempotencyKey,
    });

    await this.paymentRepository.save(payment);
    this.logger.log(`Payment ${payment.id.value} created for order ${orderId}`);

    // 4. Start processing
    payment.startProcessing();
    await this.paymentRepository.save(payment);

    // 5. Call payment provider
    const providerImpl = this.providerFactory.getProvider(resolvedProvider);

    try {
      const result = await providerImpl.processPayment({
        paymentId: payment.id.value,
        orderId,
        amountInCents,
        currency,
      });

      if (result.success) {
        payment.complete(result.transactionId);
        this.metricsService.incrementSuccess(resolvedProvider);
        this.logger.log(
          `Payment ${payment.id.value} completed — txId: ${result.transactionId}`,
        );
      } else {
        payment.fail('Provider returned unsuccessful result');
        this.metricsService.incrementFailure(
          resolvedProvider,
          'Provider Unsuccessful',
        );
        this.logger.warn(
          `Payment ${payment.id.value} failed — provider returned unsuccessful`,
        );
      }
    } catch (error) {
      payment.fail((error as Error).message);
      this.metricsService.incrementFailure(resolvedProvider, 'Provider Error');
      this.logger.error(
        `Payment ${payment.id.value} failed — error: ${(error as Error).message}`,
      );
    } finally {
      endTimer();
    }

    // 6. Save final state and publish events
    await this.paymentRepository.save(payment);
    const events = payment.pullDomainEvents();
    await this.eventPublisher.publishAll(events);

    return payment.toJSON();
  }

  private resolveProvider(providerName?: string): PaymentProviderEnum {
    if (!providerName) {
      const defaultProvider = process.env.DEFAULT_PAYMENT_PROVIDER || 'MOCK';
      return (
        PaymentProviderEnum[
          defaultProvider as keyof typeof PaymentProviderEnum
        ] ?? PaymentProviderEnum.MOCK
      );
    }
    const resolved =
      PaymentProviderEnum[
        providerName.toUpperCase() as keyof typeof PaymentProviderEnum
      ];
    if (!resolved) {
      this.logger.warn(
        `Unknown provider "${providerName}", falling back to MOCK`,
      );
      return PaymentProviderEnum.MOCK;
    }
    return resolved;
  }
}
