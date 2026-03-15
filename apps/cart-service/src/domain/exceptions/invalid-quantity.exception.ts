import { DomainException } from './domain-exception';

export class InvalidQuantityException extends DomainException {
  public readonly code = 'INVALID_QUANTITY';

  constructor(public readonly value: number) {
    super(`Invalid quantity: ${value}. Must be an integer between 1 and 99`);
  }
}
