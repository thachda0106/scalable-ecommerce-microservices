import { CartItem } from './cart-item.entity';
import { ProductId } from '../value-objects/product-id.vo';
import { Quantity } from '../value-objects/quantity.vo';
import { BaseDomainEvent } from '../events/base-domain.event';
import { ItemAddedEvent } from '../events/item-added.event';
import { ItemRemovedEvent } from '../events/item-removed.event';
import { CartClearedEvent } from '../events/cart-cleared.event';
import { ItemQuantityUpdatedEvent } from '../events/item-quantity-updated.event';
import { ItemNotInCartException, CartFullException } from '../exceptions';

/** Maximum number of distinct items allowed in a single cart. */
export const MAX_CART_ITEMS = 50;

interface CartProps {
  id: string;
  userId: string;
  items: CartItem[];
  domainEvents: BaseDomainEvent[];
}

export class Cart {
  private readonly props: CartProps;

  private constructor(props: CartProps) {
    this.props = props;
  }

  // ─── Factory Methods ────────────────────────────────────────────────────────

  /**
   * Creates a brand-new cart. Generates a UUID id using the Node built-in.
   * Does NOT emit any domain events.
   */
  public static create(userId: string): Cart {
    return new Cart({
      id: crypto.randomUUID(),
      userId,
      items: [],
      domainEvents: [],
    });
  }

  /**
   * Reconstitutes a cart from persistence (e.g., Redis or MongoDB).
   * Does NOT emit domain events — it's already in a known state.
   */
  public static reconstitute(
    id: string,
    userId: string,
    items: CartItem[],
  ): Cart {
    return new Cart({ id, userId, items, domainEvents: [] });
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get id(): string {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  get items(): CartItem[] {
    return [...this.props.items];
  }

  // ─── Domain Behaviour ────────────────────────────────────────────────────

  /**
   * Adds an item to the cart.
   * Business rules:
   *   - quantity must be 1-99 (enforced by Quantity VO)
   *   - if productId already exists, quantities are merged
   *   - merged quantity must not exceed 99 (enforced by Quantity.add)
   *   - cart cannot exceed MAX_CART_ITEMS distinct products
   */
  public addItem(
    productId: ProductId,
    quantity: Quantity,
    snapshottedPrice: number,
  ): void {
    const existingIndex = this.props.items.findIndex((item) =>
      item.productId.equals(productId),
    );

    if (existingIndex >= 0) {
      // Merge quantity — Quantity.add() throws if result > 99
      const updated =
        this.props.items[existingIndex].increaseQuantity(quantity);
      this.props.items[existingIndex] = updated;
    } else {
      if (this.props.items.length >= MAX_CART_ITEMS) {
        throw new CartFullException(MAX_CART_ITEMS);
      }
      this.props.items.push(
        CartItem.create(productId, quantity, snapshottedPrice),
      );
    }

    this.props.domainEvents.push(
      new ItemAddedEvent(
        this.props.id,
        this.props.userId,
        productId.getValue(),
        quantity.getValue(),
        snapshottedPrice,
      ),
    );
  }

  /**
   * Removes an item from the cart.
   * Throws ItemNotInCartException if the item does not exist.
   */
  public removeItem(productId: ProductId): void {
    const existingIndex = this.props.items.findIndex((item) =>
      item.productId.equals(productId),
    );

    if (existingIndex < 0) {
      throw new ItemNotInCartException(productId.getValue());
    }

    this.props.items.splice(existingIndex, 1);

    this.props.domainEvents.push(
      new ItemRemovedEvent(
        this.props.id,
        this.props.userId,
        productId.getValue(),
      ),
    );
  }

  /**
   * Sets the quantity of an existing item.
   * Throws ItemNotInCartException if the item does not exist.
   */
  public updateItemQuantity(productId: ProductId, newQuantity: Quantity): void {
    const existingIndex = this.props.items.findIndex((item) =>
      item.productId.equals(productId),
    );

    if (existingIndex < 0) {
      throw new ItemNotInCartException(productId.getValue());
    }

    const oldQuantity = this.props.items[existingIndex].quantity.getValue();
    this.props.items[existingIndex] =
      this.props.items[existingIndex].withQuantity(newQuantity);

    this.props.domainEvents.push(
      new ItemQuantityUpdatedEvent(
        this.props.id,
        this.props.userId,
        productId.getValue(),
        oldQuantity,
        newQuantity.getValue(),
      ),
    );
  }

  /**
   * Removes all items from the cart.
   */
  public clear(): void {
    this.props.items = [];
    this.props.domainEvents.push(
      new CartClearedEvent(this.props.id, this.props.userId),
    );
  }

  /**
   * Returns accumulated domain events and clears the internal buffer.
   * Call this after persisting the cart to dispatch events.
   */
  public pullEvents(): BaseDomainEvent[] {
    const events = [...this.props.domainEvents];
    this.props.domainEvents.length = 0;
    return events;
  }

  // ─── Serialisation ───────────────────────────────────────────────────────

  public toJSON(): {
    id: string;
    userId: string;
    items: ReturnType<CartItem['toJSON']>[];
  } {
    return {
      id: this.props.id,
      userId: this.props.userId,
      items: this.props.items.map((item) => item.toJSON()),
    };
  }
}
