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

/** Default cart expiration: 30 days in milliseconds. */
const CART_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

interface CartProps {
  id: string;
  userId: string;
  items: CartItem[];
  domainEvents: BaseDomainEvent[];
  version: number;
  createdAt: Date;
  expiresAt: Date;
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
    const now = new Date();
    return new Cart({
      id: crypto.randomUUID(),
      userId,
      items: [],
      domainEvents: [],
      version: 0,
      createdAt: now,
      expiresAt: new Date(now.getTime() + CART_EXPIRY_MS),
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
    version: number = 0,
    createdAt: Date = new Date(),
    expiresAt: Date = new Date(Date.now() + CART_EXPIRY_MS),
  ): Cart {
    return new Cart({
      id,
      userId,
      items,
      domainEvents: [],
      version,
      createdAt,
      expiresAt,
    });
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

  get version(): number {
    return this.props.version;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
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

    this.refreshExpiry();
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

    this.refreshExpiry();
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

    this.refreshExpiry();
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
    this.refreshExpiry();
    this.props.domainEvents.push(
      new CartClearedEvent(this.props.id, this.props.userId),
    );
  }

  /**
   * Increments the version counter. Called by the repository after a successful save.
   */
  public incrementVersion(): void {
    this.props.version += 1;
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

  // ─── Private Helpers ────────────────────────────────────────────────────

  /** Extends the cart expiry by 30 days from now on every mutation. */
  private refreshExpiry(): void {
    this.props.expiresAt = new Date(Date.now() + CART_EXPIRY_MS);
  }

  // ─── Serialisation ───────────────────────────────────────────────────────

  public toJSON(): {
    id: string;
    userId: string;
    items: ReturnType<CartItem['toJSON']>[];
    version: number;
    createdAt: string;
    expiresAt: string;
  } {
    return {
      id: this.props.id,
      userId: this.props.userId,
      items: this.props.items.map((item) => item.toJSON()),
      version: this.props.version,
      createdAt: this.props.createdAt.toISOString(),
      expiresAt: this.props.expiresAt.toISOString(),
    };
  }
}
