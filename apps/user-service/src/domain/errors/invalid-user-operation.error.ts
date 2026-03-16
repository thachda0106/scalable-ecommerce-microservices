import { DomainException } from './domain-exception';

export class InvalidUserOperationError extends DomainException {
  constructor(
    public readonly operation: string,
    message: string,
  ) {
    super(
      `Invalid operation '${operation}': ${message}`,
      'INVALID_USER_OPERATION',
    );
    this.name = 'InvalidUserOperationError';
  }
}
