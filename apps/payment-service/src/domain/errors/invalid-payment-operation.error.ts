import { DomainException } from './domain-exception';

export class InvalidPaymentOperationError extends DomainException {
  constructor(operation: string, message: string) {
    super(`Invalid payment operation [${operation}]: ${message}`);
  }
}
