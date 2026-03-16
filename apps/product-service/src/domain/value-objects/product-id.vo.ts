import { randomUUID } from 'crypto';

export class ProductId {
  private readonly _value: string;

  private constructor(value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('ProductId cannot be empty');
    }
    this._value = value;
  }

  static create(id: string): ProductId {
    return new ProductId(id);
  }

  static generate(): ProductId {
    return new ProductId(randomUUID());
  }

  get value(): string {
    return this._value;
  }

  equals(other: ProductId): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
