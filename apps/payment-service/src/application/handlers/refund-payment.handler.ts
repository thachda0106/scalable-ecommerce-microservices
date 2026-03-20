import { Inject, Logger } from '@nestjs/common';
import { RefundPaymentCommand } from '../commands/refund-payment.command';
import { PaymentId } from '../../domain/value-objects/payment-id.vo';
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

export class RefundPaymentHandler {
  private readonly logger = new Logger(RefundPaymentHandler.name);

  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepository: IPaymentRepository,
    @Inject(PAYMENT_PROVIDER_FACTORY)
    private readonly providerFactory: IPaymentProviderFactory,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(
    command: RefundPaymentCommand,
  ): Promise<Record<string, unknown>> {
    const { paymentId, reason } = command;

    // 1. Find payment
    const payment = await this.paymentRepository.findById(
      PaymentId.create(paymentId),
    );
    if (!payment) {
      throw new Error(`Payment ${paymentId} not found`);
    }

    // 2. Call provider refund
    const provider = this.providerFactory.getProvider(payment.provider);

    try {
      await provider.refundPayment(payment.transactionId!, payment.amount);
      this.logger.log(`Refund successful for payment ${paymentId}`);
    } catch (error) {
      this.logger.error(
        `Refund failed for payment ${paymentId}: ${(error as Error).message}`,
      );
      throw error;
    }

    // 3. Transition domain state
    payment.refund(reason);
    await this.paymentRepository.save(payment);

    // 4. Publish events
    const events = payment.pullDomainEvents();
    await this.eventPublisher.publishAll(events);

    this.logger.log(`Payment ${paymentId} refunded: ${reason}`);
    return payment.toJSON();
  }
}
