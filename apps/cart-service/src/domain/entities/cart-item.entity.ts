import { ProductId } from '../value-objects/product-id.vo';
import { Quantity } from '../value-objects/quantity.vo';

export interface CartItemProps {
  productId: ProductId;
  quantity: Quantity;
  snapshottedPrice: number;
}

export class CartItem {
  private constructor(private readonly props: CartItemProps) {}

  public static create(
    productId: ProductId,
    quantity: Quantity,
    snapshottedPrice: number,
  ): CartItem {
    return new CartItem({ productId, quantity, snapshottedPrice });
  }

  get productId(): ProductId {
    return this.props.productId;
  }

  get quantity(): Quantity {
    return this.props.quantity;
  }

  get snapshottedPrice(): number {
    return this.props.snapshottedPrice;
  }

  /**
   * Returns a new CartItem with increased quantity.
   * Throws if the resulting quantity exceeds the maximum (99).
   */
  public increaseQuantity(additional: Quantity): CartItem {
    const newQuantity = this.props.quantity.add(additional);
    return CartItem.create(this.props.productId, newQuantity, this.props.snapshottedPrice);
  }

  public toJSON(): { productId: string; quantity: number; snapshottedPrice: number } {
    return {
      productId: this.props.productId.getValue(),
      quantity: this.props.quantity.getValue(),
      snapshottedPrice: this.props.snapshottedPrice,
    };
  }
}
