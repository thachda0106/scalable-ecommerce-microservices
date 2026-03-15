import { DomainException } from './domain-exception';

export class InvalidProductIdException extends DomainException {
  public readonly code = 'INVALID_PRODUCT_ID';

  constructor(public readonly value: string) {
    super(`Invalid productId: "${value}". Must be a valid UUID v4`);
  }
}
