import { v4 as uuidv4 } from 'uuid';

export class PaymentId {
  private readonly _value: string;

  private constructor(value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('PaymentId cannot be empty');
    }
    this._value = value;
  }

  static create(id: string): PaymentId {
    return new PaymentId(id);
  }

  static generate(): PaymentId {
    return new PaymentId(uuidv4());
  }

  get value(): string {
    return this._value;
  }

  equals(other: PaymentId): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
