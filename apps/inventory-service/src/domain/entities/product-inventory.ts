import { BaseDomainEvent } from '../events/base-domain.event';
import { StockReservedEvent } from '../events/stock-reserved.event';
import { StockReleasedEvent } from '../events/stock-released.event';
import { StockConfirmedEvent } from '../events/stock-confirmed.event';
import { LowStockDetectedEvent } from '../events/low-stock-detected.event';
import { InsufficientStockError } from '../errors/insufficient-stock.error';
import { StockInvariantViolationError } from '../errors/stock-invariant-violation.error';

export interface CreateInventoryProps {
  productId: string;
  sku: string;
  initialStock: number;
  lowStockThreshold?: number;
}

export interface ReconstituteInventoryProps {
  productId: string;
  sku: string;
  availableStock: number;
  reservedStock: number;
  soldStock: number;
  totalStock: number;
  lowStockThreshold: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export class ProductInventory {
  private _productId: string;
  private _sku: string;
  private _availableStock: number;
  private _reservedStock: number;
  private _soldStock: number;
  private _totalStock: number;
  private _lowStockThreshold: number;
  private _version: number;
  private _createdAt: Date;
  private _updatedAt: Date;
  private _domainEvents: BaseDomainEvent[] = [];

  private constructor() {}

  static create(props: CreateInventoryProps): ProductInventory {
    const inv = new ProductInventory();
    inv._productId = props.productId;
    inv._sku = props.sku;
    inv._availableStock = props.initialStock;
    inv._reservedStock = 0;
    inv._soldStock = 0;
    inv._totalStock = props.initialStock;
    inv._lowStockThreshold = props.lowStockThreshold ?? 100;
    inv._version = 1;
    inv._createdAt = new Date();
    inv._updatedAt = new Date();
    return inv;
  }

  static reconstitute(props: ReconstituteInventoryProps): ProductInventory {
    const inv = new ProductInventory();
    inv._productId = props.productId;
    inv._sku = props.sku;
    inv._availableStock = props.availableStock;
    inv._reservedStock = props.reservedStock;
    inv._soldStock = props.soldStock;
    inv._totalStock = props.totalStock;
    inv._lowStockThreshold = props.lowStockThreshold;
    inv._version = props.version;
    inv._createdAt = props.createdAt;
    inv._updatedAt = props.updatedAt;
    return inv;
  }

  /**
   * Reserve stock for a cart or order.
   * Atomically checks available >= quantity, then decrements available and increments reserved.
   * This is the core oversell prevention method.
   */
  reserve(
    quantity: number,
    reservationId: string,
    referenceId: string,
    referenceType: 'CART' | 'ORDER',
  ): void {
    if (this._availableStock < quantity) {
      throw new InsufficientStockError(
        this._productId,
        quantity,
        this._availableStock,
      );
    }

    this._availableStock -= quantity;
    this._reservedStock += quantity;
    this._updatedAt = new Date();

    this.validateInvariant();

    this._domainEvents.push(
      new StockReservedEvent(
        this._productId,
        quantity,
        reservationId,
        referenceId,
        referenceType,
        this._availableStock,
      ),
    );

    if (this._availableStock <= this._lowStockThreshold) {
      this._domainEvents.push(
        new LowStockDetectedEvent(
          this._productId,
          this._availableStock,
          this._lowStockThreshold,
        ),
      );
    }
  }

  /**
   * Release previously reserved stock back to available.
   * Used when cart expires, order fails, or manual cancellation.
   */
  release(
    quantity: number,
    reservationId: string,
    referenceId: string,
    reason: string,
  ): void {
    if (this._reservedStock < quantity) {
      throw new Error(
        `Cannot release ${quantity} units: only ${this._reservedStock} reserved for product ${this._productId}`,
      );
    }

    this._reservedStock -= quantity;
    this._availableStock += quantity;
    this._updatedAt = new Date();

    this.validateInvariant();

    this._domainEvents.push(
      new StockReleasedEvent(
        this._productId,
        quantity,
        reservationId,
        referenceId,
        reason,
        this._availableStock,
      ),
    );
  }

  /**
   * Confirm reserved stock as sold.
   * Moves units from reserved to sold — permanent deduction.
   */
  confirm(
    quantity: number,
    reservationId: string,
    referenceId: string,
  ): void {
    if (this._reservedStock < quantity) {
      throw new Error(
        `Cannot confirm ${quantity} units: only ${this._reservedStock} reserved for product ${this._productId}`,
      );
    }

    this._reservedStock -= quantity;
    this._soldStock += quantity;
    this._updatedAt = new Date();

    this.validateInvariant();

    this._domainEvents.push(
      new StockConfirmedEvent(
        this._productId,
        quantity,
        reservationId,
        referenceId,
        this._availableStock,
        this._soldStock,
      ),
    );
  }

  /**
   * Replenish stock (warehouse restock or admin adjustment).
   * Increases both available and total.
   */
  replenish(quantity: number): void {
    this._availableStock += quantity;
    this._totalStock += quantity;
    this._updatedAt = new Date();

    this.validateInvariant();
  }

  /**
   * Validates the core stock invariant:
   *   availableStock + reservedStock + soldStock === totalStock
   */
  private validateInvariant(): void {
    const sum =
      this._availableStock + this._reservedStock + this._soldStock;
    if (sum !== this._totalStock) {
      throw new StockInvariantViolationError(
        this._productId,
        `available(${this._availableStock}) + reserved(${this._reservedStock}) + sold(${this._soldStock}) = ${sum} ≠ total(${this._totalStock})`,
      );
    }
  }

  /**
   * Pull and clear accumulated domain events.
   * Should be called by the handler after persistence to publish events.
   */
  pullEvents(): BaseDomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }

  // Getters
  get productId(): string {
    return this._productId;
  }
  get sku(): string {
    return this._sku;
  }
  get availableStock(): number {
    return this._availableStock;
  }
  get reservedStock(): number {
    return this._reservedStock;
  }
  get soldStock(): number {
    return this._soldStock;
  }
  get totalStock(): number {
    return this._totalStock;
  }
  get lowStockThreshold(): number {
    return this._lowStockThreshold;
  }
  get version(): number {
    return this._version;
  }
  get createdAt(): Date {
    return this._createdAt;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }
  get isLowStock(): boolean {
    return this._availableStock <= this._lowStockThreshold;
  }

  toJSON() {
    return {
      productId: this._productId,
      sku: this._sku,
      availableStock: this._availableStock,
      reservedStock: this._reservedStock,
      soldStock: this._soldStock,
      totalStock: this._totalStock,
      lowStockThreshold: this._lowStockThreshold,
      isLowStock: this.isLowStock,
      version: this._version,
      createdAt: this._createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString(),
    };
  }
}
