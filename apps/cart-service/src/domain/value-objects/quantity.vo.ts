export const MAX_QUANTITY = 99;
export const MIN_QUANTITY = 1;

export class Quantity {
  private constructor(private readonly value: number) {}

  public static create(value: number): Quantity {
    if (!Number.isInteger(value) || value < MIN_QUANTITY || value > MAX_QUANTITY) {
      throw new Error(
        `Invalid quantity: must be integer ${MIN_QUANTITY}-${MAX_QUANTITY}`,
      );
    }
    return new Quantity(value);
  }

  public getValue(): number {
    return this.value;
  }

  /**
   * Adds two quantities together. Throws if the result exceeds MAX_QUANTITY.
   */
  public add(other: Quantity): Quantity {
    return Quantity.create(this.value + other.value);
  }

  public equals(other: Quantity): boolean {
    return this.value === other.value;
  }

  public toString(): string {
    return String(this.value);
  }
}
