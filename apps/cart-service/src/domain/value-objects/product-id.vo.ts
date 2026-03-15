import { InvalidProductIdException } from '../exceptions';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ProductId {
  private constructor(private readonly value: string) {}

  public static create(value: string): ProductId {
    if (!UUID_V4_REGEX.test(value)) {
      throw new InvalidProductIdException(value);
    }
    return new ProductId(value);
  }

  public getValue(): string {
    return this.value;
  }

  public equals(other: ProductId): boolean {
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }
}
