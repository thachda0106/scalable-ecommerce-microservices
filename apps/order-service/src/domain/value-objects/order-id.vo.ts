export class OrderId {
  private readonly _value: string;

  private constructor(value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('OrderId cannot be empty');
    }
    this._value = value;
  }

  static create(value: string): OrderId {
    return new OrderId(value);
  }

  static generate(): OrderId {
    return new OrderId(crypto.randomUUID());
  }

  get value(): string {
    return this._value;
  }

  equals(other: OrderId): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
