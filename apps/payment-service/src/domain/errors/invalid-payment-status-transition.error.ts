import { DomainException } from './domain-exception';

export class InvalidPaymentStatusTransitionError extends DomainException {
  constructor(from: string, to: string) {
    super(`Invalid payment status transition: ${from} → ${to}`);
  }
}
