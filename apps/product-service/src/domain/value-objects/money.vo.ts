export class Money {
  private readonly _amountInCents: number;
  private readonly _currency: string;

  private constructor(amountInCents: number, currency: string) {
    if (!Number.isInteger(amountInCents)) {
      throw new Error('Amount in cents must be an integer');
    }
    this._amountInCents = amountInCents;
    this._currency = currency;
  }

  static fromDecimal(amount: number, currency: string = 'USD'): Money {
    return new Money(Math.round(amount * 100), currency);
  }

  static fromCents(cents: number, currency: string = 'USD'): Money {
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
    if (this._currency !== other._currency) {
      throw new Error(
        `Cannot add different currencies: ${this._currency} and ${other._currency}`,
      );
    }
    return new Money(
      this._amountInCents + other._amountInCents,
      this._currency,
    );
  }

  multiply(factor: number): Money {
    return new Money(Math.round(this._amountInCents * factor), this._currency);
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
    return `${this.toDecimal()} ${this._currency}`;
  }
}
