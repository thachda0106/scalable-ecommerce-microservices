import { DomainException } from './domain-exception';

export class InvalidProductOperationError extends DomainException {
  public readonly operation: string;

  constructor(operation: string, message: string) {
    super('INVALID_PRODUCT_OPERATION', message);
    this.operation = operation;
    this.name = 'InvalidProductOperationError';
  }
}
