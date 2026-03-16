import { DomainException } from './domain-exception';

export class InvalidUserStatusTransitionError extends DomainException {
  constructor(
    public readonly fromStatus: string,
    public readonly toStatus: string,
  ) {
    super(
      `Invalid user status transition from '${fromStatus}' to '${toStatus}'`,
      'INVALID_USER_STATUS_TRANSITION',
    );
    this.name = 'InvalidUserStatusTransitionError';
  }
}
