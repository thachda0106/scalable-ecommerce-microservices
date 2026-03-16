import { InvalidProductStatusTransitionError } from '../errors/invalid-product-status-transition.error';

export enum ProductStatusEnum {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
  ARCHIVED = 'ARCHIVED',
}

const VALID_TRANSITIONS: Map<ProductStatusEnum, ProductStatusEnum[]> = new Map([
  [ProductStatusEnum.ACTIVE, [ProductStatusEnum.INACTIVE, ProductStatusEnum.OUT_OF_STOCK, ProductStatusEnum.ARCHIVED]],
  [ProductStatusEnum.INACTIVE, [ProductStatusEnum.ACTIVE, ProductStatusEnum.ARCHIVED]],
  [ProductStatusEnum.OUT_OF_STOCK, [ProductStatusEnum.ACTIVE, ProductStatusEnum.ARCHIVED]],
  [ProductStatusEnum.ARCHIVED, []], // terminal state
]);

export class ProductStatus {
  private readonly _value: ProductStatusEnum;

  private constructor(value: ProductStatusEnum) {
    this._value = value;
  }

  static create(value: ProductStatusEnum): ProductStatus {
    return new ProductStatus(value);
  }

  static active(): ProductStatus {
    return new ProductStatus(ProductStatusEnum.ACTIVE);
  }

  get value(): ProductStatusEnum {
    return this._value;
  }

  canTransitionTo(target: ProductStatusEnum): boolean {
    const allowed = VALID_TRANSITIONS.get(this._value) ?? [];
    return allowed.includes(target);
  }

  transitionTo(target: ProductStatusEnum): ProductStatus {
    if (!this.canTransitionTo(target)) {
      throw new InvalidProductStatusTransitionError(this._value, target);
    }
    return new ProductStatus(target);
  }

  isTerminal(): boolean {
    return this._value === ProductStatusEnum.ARCHIVED;
  }

  equals(other: ProductStatus): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
