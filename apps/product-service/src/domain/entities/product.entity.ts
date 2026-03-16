import { ProductId } from '../value-objects/product-id.vo';
import { Money } from '../value-objects/money.vo';
import { ProductStatus, ProductStatusEnum } from '../value-objects/product-status.vo';
import { BaseDomainEvent } from '../events/base-domain.event';
import { ProductCreatedEvent } from '../events/product-created.event';
import { ProductUpdatedEvent } from '../events/product-updated.event';
import { ProductStockUpdatedEvent } from '../events/product-stock-updated.event';
import { InvalidProductOperationError } from '../errors/invalid-product-operation.error';

export interface CreateProductProps {
  name: string;
  description: string;
  price: number;
  currency?: string;
  categoryId: string;
}

export interface ReconstituteProductProps {
  id: string;
  name: string;
  description: string;
  priceInCents: number;
  currency: string;
  categoryId: string;
  status: ProductStatusEnum;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export class Product {
  private _id: ProductId;
  private _name: string;
  private _description: string;
  private _price: Money;
  private _categoryId: string;
  private _status: ProductStatus;
  private _version: number;
  private _createdAt: Date;
  private _updatedAt: Date;
  private _domainEvents: BaseDomainEvent[] = [];

  private constructor() {}

  static create(props: CreateProductProps): Product {
    if (!props.name || props.name.trim().length === 0) {
      throw new InvalidProductOperationError('createProduct', 'Product name cannot be empty');
    }
    if (props.price <= 0) {
      throw new InvalidProductOperationError('createProduct', 'Product price must be positive');
    }

    const product = new Product();
    product._id = ProductId.generate();
    product._name = props.name.trim();
    product._description = props.description;
    product._price = Money.fromDecimal(props.price, props.currency ?? 'USD');
    product._categoryId = props.categoryId;
    product._status = ProductStatus.active();
    product._version = 1;
    product._createdAt = new Date();
    product._updatedAt = new Date();

    product._domainEvents.push(
      new ProductCreatedEvent(
        product._id.value,
        product._name,
        product._price.toDecimal(),
        product._price.currency,
        product._categoryId,
        product._status.value,
      ),
    );

    return product;
  }

  static reconstitute(props: ReconstituteProductProps): Product {
    const product = new Product();
    product._id = ProductId.create(props.id);
    product._name = props.name;
    product._description = props.description;
    product._price = Money.fromCents(props.priceInCents, props.currency);
    product._categoryId = props.categoryId;
    product._status = ProductStatus.create(props.status);
    product._version = props.version;
    product._createdAt = props.createdAt;
    product._updatedAt = props.updatedAt;
    return product;
  }

  // ─── Domain Behaviors ─────────────────────────────────────────────────

  updateDetails(props: {
    name?: string;
    description?: string;
    price?: number;
    currency?: string;
    categoryId?: string;
  }): void {
    if (this._status.isTerminal()) {
      throw new InvalidProductOperationError(
        'updateDetails',
        `Cannot update product when status is ${this._status.value}`,
      );
    }

    if (props.name !== undefined) {
      if (!props.name || props.name.trim().length === 0) {
        throw new InvalidProductOperationError('updateDetails', 'Product name cannot be empty');
      }
      this._name = props.name.trim();
    }
    if (props.description !== undefined) {
      this._description = props.description;
    }
    if (props.price !== undefined) {
      if (props.price <= 0) {
        throw new InvalidProductOperationError('updateDetails', 'Product price must be positive');
      }
      this._price = Money.fromDecimal(props.price, props.currency ?? this._price.currency);
    } else if (props.currency !== undefined) {
      this._price = Money.fromCents(this._price.amountInCents, props.currency);
    }
    if (props.categoryId !== undefined) {
      this._categoryId = props.categoryId;
    }

    this._updatedAt = new Date();

    this._domainEvents.push(
      new ProductUpdatedEvent(
        this._id.value,
        this._name,
        this._price.toDecimal(),
        this._price.currency,
        this._categoryId,
        this._status.value,
      ),
    );
  }

  activate(): void {
    this._status = this._status.transitionTo(ProductStatusEnum.ACTIVE);
    this._updatedAt = new Date();

    this._domainEvents.push(
      new ProductUpdatedEvent(
        this._id.value,
        this._name,
        this._price.toDecimal(),
        this._price.currency,
        this._categoryId,
        this._status.value,
      ),
    );
  }

  deactivate(): void {
    this._status = this._status.transitionTo(ProductStatusEnum.INACTIVE);
    this._updatedAt = new Date();

    this._domainEvents.push(
      new ProductUpdatedEvent(
        this._id.value,
        this._name,
        this._price.toDecimal(),
        this._price.currency,
        this._categoryId,
        this._status.value,
      ),
    );
  }

  markOutOfStock(): void {
    this._status = this._status.transitionTo(ProductStatusEnum.OUT_OF_STOCK);
    this._updatedAt = new Date();

    this._domainEvents.push(
      new ProductStockUpdatedEvent(this._id.value, this._status.value),
    );
  }

  restock(): void {
    this._status = this._status.transitionTo(ProductStatusEnum.ACTIVE);
    this._updatedAt = new Date();

    this._domainEvents.push(
      new ProductStockUpdatedEvent(this._id.value, this._status.value),
    );
  }

  archive(): void {
    this._status = this._status.transitionTo(ProductStatusEnum.ARCHIVED);
    this._updatedAt = new Date();

    this._domainEvents.push(
      new ProductUpdatedEvent(
        this._id.value,
        this._name,
        this._price.toDecimal(),
        this._price.currency,
        this._categoryId,
        this._status.value,
      ),
    );
  }

  // ─── Event Handling ──────────────────────────────────────────────────

  pullDomainEvents(): BaseDomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }

  // ─── Getters ─────────────────────────────────────────────────────────

  get id(): ProductId {
    return this._id;
  }

  get name(): string {
    return this._name;
  }

  get description(): string {
    return this._description;
  }

  get price(): Money {
    return this._price;
  }

  get categoryId(): string {
    return this._categoryId;
  }

  get status(): ProductStatus {
    return this._status;
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

  toJSON() {
    return {
      id: this._id.value,
      name: this._name,
      description: this._description,
      price: this._price.toDecimal(),
      currency: this._price.currency,
      categoryId: this._categoryId,
      status: this._status.value,
      version: this._version,
      createdAt: this._createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString(),
    };
  }
}
