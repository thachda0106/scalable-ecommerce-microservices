/**
 * Money value object — uses integer cents internally to avoid floating-point issues.
 * Example: $19.99 = Money.fromDecimal(19.99, 'USD') → internally stores 1999 cents.
 */
export class Money {
  private readonly _amountInCents: number;
  private readonly _currency: string;

  private constructor(amountInCents: number, currency: string) {
    if (!Number.isInteger(amountInCents)) {
      throw new Error('Money amount must be an integer (cents)');
    }
    if (amountInCents < 0) {
      throw new Error('Money amount cannot be negative');
    }
    this._amountInCents = amountInCents;
    this._currency = currency;
  }

  static fromCents(amountInCents: number, currency: string = 'USD'): Money {
    return new Money(amountInCents, currency);
  }

  static fromDecimal(amount: number, currency: string = 'USD'): Money {
    const cents = Math.round(amount * 100);
    return new Money(cents, currency);
  }

  static zero(currency: string = 'USD'): Money {
    return new Money(0, currency);
  }

  get amountInCents(): number {
    return this._amountInCents;
  }

  get currency(): string {
    return this._currency;
  }

  toDecimal(): number {
    return this._amountInCents / 100;
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(
      this._amountInCents + other._amountInCents,
      this._currency,
    );
  }

  multiply(quantity: number): Money {
    if (quantity < 0) {
      throw new Error('Cannot multiply money by negative quantity');
    }
    return new Money(
      Math.round(this._amountInCents * quantity),
      this._currency,
    );
  }

  isPositive(): boolean {
    return this._amountInCents > 0;
  }

  isZero(): boolean {
    return this._amountInCents === 0;
  }

  equals(other: Money): boolean {
    return (
      this._amountInCents === other._amountInCents &&
      this._currency === other._currency
    );
  }

  toString(): string {
    return `${this.toDecimal().toFixed(2)} ${this._currency}`;
  }

  private assertSameCurrency(other: Money): void {
    if (this._currency !== other._currency) {
      throw new Error(
        `Cannot operate on different currencies: ${this._currency} vs ${other._currency}`,
      );
    }
  }
}
