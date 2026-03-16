import { BaseDomainEvent } from './base-domain.event';

export class PaymentProcessingEvent extends BaseDomainEvent {
  constructor(
    public readonly paymentId: string,
    public readonly orderId: string,
    public readonly provider: string,
  ) {
    super();
  }

  get eventType(): string {
    return 'PaymentProcessing';
  }
}
