import { DomainException } from './domain-exception';

export class InvalidProductStatusTransitionError extends DomainException {
  public readonly fromStatus: string;
  public readonly toStatus: string;

  constructor(fromStatus: string, toStatus: string) {
    super(
      'INVALID_STATUS_TRANSITION',
      `Cannot transition product status from ${fromStatus} to ${toStatus}`,
    );
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
    this.name = 'InvalidProductStatusTransitionError';
  }
}
