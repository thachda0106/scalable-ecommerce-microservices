import { DomainException } from './domain-exception';

export class InvalidOrderOperationError extends DomainException {
  constructor(operation: string, reason: string) {
    super(`Invalid order operation '${operation}': ${reason}`);
    this.name = 'InvalidOrderOperationError';
  }
}
