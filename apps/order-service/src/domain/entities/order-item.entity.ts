import { Money } from '../value-objects/money.vo';

export interface CreateOrderItemProps {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: Money;
}

export class OrderItem {
  private _id: string;
  private _productId: string;
  private _productName: string;
  private _quantity: number;
  private _unitPrice: Money;

  private constructor() {}

  static create(props: CreateOrderItemProps): OrderItem {
    if (props.quantity <= 0) {
      throw new Error('OrderItem quantity must be greater than 0');
    }
    if (!props.unitPrice.isPositive()) {
      throw new Error('OrderItem unit price must be positive');
    }

    const item = new OrderItem();
    item._id = crypto.randomUUID();
    item._productId = props.productId;
    item._productName = props.productName;
    item._quantity = props.quantity;
    item._unitPrice = props.unitPrice;
    return item;
  }

  static reconstitute(
    id: string,
    productId: string,
    productName: string,
    quantity: number,
    unitPrice: Money,
  ): OrderItem {
    const item = new OrderItem();
    item._id = id;
    item._productId = productId;
    item._productName = productName;
    item._quantity = quantity;
    item._unitPrice = unitPrice;
    return item;
  }

  get totalPrice(): Money {
    return this._unitPrice.multiply(this._quantity);
  }

  get id(): string {
    return this._id;
  }

  get productId(): string {
    return this._productId;
  }

  get productName(): string {
    return this._productName;
  }

  get quantity(): number {
    return this._quantity;
  }

  get unitPrice(): Money {
    return this._unitPrice;
  }

  toJSON() {
    return {
      id: this._id,
      productId: this._productId,
      productName: this._productName,
      quantity: this._quantity,
      unitPrice: this._unitPrice.toDecimal(),
      currency: this._unitPrice.currency,
      totalPrice: this.totalPrice.toDecimal(),
    };
  }
}
