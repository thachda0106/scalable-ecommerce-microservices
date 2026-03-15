export class Quantity {
  private constructor(private readonly value: number) {}

  static create(value: number): Quantity {
    if (!Number.isInteger(value) || value < 1 || value > 1_000_000) {
      throw new Error('Invalid quantity: must be integer 1-1000000');
    }
    return new Quantity(value);
  }

  getValue(): number {
    return this.value;
  }

  add(other: Quantity): Quantity {
    return Quantity.create(this.value + other.value);
  }

  subtract(other: Quantity): Quantity {
    const result = this.value - other.value;
    if (result < 0) {
      throw new Error(
        `Cannot subtract ${other.value} from ${this.value}: result would be negative`,
      );
    }
    if (result === 0) {
      return new Quantity(0);
    }
    return Quantity.create(result);
  }

  isGreaterThan(other: Quantity): boolean {
    return this.value > other.value;
  }

  isLessThan(other: Quantity): boolean {
    return this.value < other.value;
  }

  equals(other: Quantity): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return String(this.value);
  }
}
