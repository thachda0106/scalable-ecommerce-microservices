import { DomainException } from './domain-exception';

export class InvalidOrderStatusTransitionError extends DomainException {
  constructor(
    public readonly fromStatus: string,
    public readonly toStatus: string,
  ) {
    super(`Invalid order status transition: ${fromStatus} → ${toStatus}`);
    this.name = 'InvalidOrderStatusTransitionError';
  }
}
