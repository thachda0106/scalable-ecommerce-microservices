import { OrderId } from '../value-objects/order-id.vo';
import { UserId } from '../value-objects/user-id.vo';
import { Money } from '../value-objects/money.vo';
import { OrderStatus, OrderStatusEnum } from '../value-objects/order-status.vo';
import { OrderItem } from './order-item.entity';
import { BaseDomainEvent } from '../events/base-domain.event';
import { OrderCreatedEvent } from '../events/order-created.event';
import { OrderPaymentRequestedEvent } from '../events/order-payment-requested.event';
import { OrderPaidEvent } from '../events/order-paid.event';
import { OrderConfirmedEvent } from '../events/order-confirmed.event';
import { OrderCancelledEvent } from '../events/order-cancelled.event';
import { OrderShippedEvent } from '../events/order-shipped.event';
import { OrderCompletedEvent } from '../events/order-completed.event';
import { OrderRefundedEvent } from '../events/order-refunded.event';
import { InvalidOrderStatusTransitionError } from '../errors/invalid-order-status-transition.error';
import { InvalidOrderOperationError } from '../errors/invalid-order-operation.error';

export interface CreateOrderProps {
  userId: string;
  items: {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    currency?: string;
  }[];
}

export interface ReconstituteOrderProps {
  id: string;
  userId: string;
  items: OrderItem[];
  status: OrderStatusEnum;
  totalPriceInCents: number;
  currency: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export class Order {
  private _id: OrderId;
  private _userId: UserId;
  private _items: OrderItem[];
  private _status: OrderStatus;
  private _totalPrice: Money;
  private _version: number;
  private _createdAt: Date;
  private _updatedAt: Date;
  private _domainEvents: BaseDomainEvent[] = [];

  private constructor() {}

  static create(props: CreateOrderProps): Order {
    if (!props.items || props.items.length === 0) {
      throw new InvalidOrderOperationError(
        'createOrder',
        'Order must have at least one item',
      );
    }

    const order = new Order();
    order._id = OrderId.generate();
    order._userId = UserId.create(props.userId);
    order._status = OrderStatus.created();
    order._version = 1;
    order._createdAt = new Date();
    order._updatedAt = new Date();

    // Create OrderItems and compute total price
    order._items = props.items.map((item) =>
      OrderItem.create({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: Money.fromDecimal(item.unitPrice, item.currency ?? 'USD'),
      }),
    );

    order._totalPrice = order.computeTotalPrice();

    // Raise domain event
    order._domainEvents.push(
      new OrderCreatedEvent(
        order._id.value,
        order._userId.value,
        order._items.map((i) => ({
          productId: i.productId,
          productName: i.productName,
          quantity: i.quantity,
          unitPrice: i.unitPrice.toDecimal(),
        })),
        order._totalPrice.toDecimal(),
        order._totalPrice.currency,
      ),
    );

    return order;
  }

  static reconstitute(props: ReconstituteOrderProps): Order {
    const order = new Order();
    order._id = OrderId.create(props.id);
    order._userId = UserId.create(props.userId);
    order._items = props.items;
    order._status = OrderStatus.create(props.status);
    order._totalPrice = Money.fromCents(
      props.totalPriceInCents,
      props.currency,
    );
    order._version = props.version;
    order._createdAt = props.createdAt;
    order._updatedAt = props.updatedAt;
    return order;
  }

  // ─── Domain Behaviors ─────────────────────────────────────────────────

  requestPayment(): void {
    this.transitionStatus(OrderStatusEnum.PENDING_PAYMENT);

    this._domainEvents.push(
      new OrderPaymentRequestedEvent(
        this._id.value,
        this._totalPrice.toDecimal(),
        this._totalPrice.currency,
        this._userId.value,
      ),
    );
  }

  confirmPayment(paymentId: string): void {
    this.transitionStatus(OrderStatusEnum.PAID);

    this._domainEvents.push(new OrderPaidEvent(this._id.value, paymentId));
  }

  confirm(): void {
    this.transitionStatus(OrderStatusEnum.CONFIRMED);

    this._domainEvents.push(new OrderConfirmedEvent(this._id.value));
  }

  cancel(reason: string = 'No reason provided'): void {
    this.transitionStatus(OrderStatusEnum.CANCELLED);

    this._domainEvents.push(new OrderCancelledEvent(this._id.value, reason));
  }

  ship(trackingNumber: string): void {
    this.transitionStatus(OrderStatusEnum.SHIPPED);

    this._domainEvents.push(
      new OrderShippedEvent(this._id.value, trackingNumber),
    );
  }

  deliver(): void {
    this.transitionStatus(OrderStatusEnum.DELIVERED);

    this._domainEvents.push(new OrderCompletedEvent(this._id.value));
  }

  refund(reason: string = 'No reason provided'): void {
    this.transitionStatus(OrderStatusEnum.REFUNDED);

    this._domainEvents.push(
      new OrderRefundedEvent(
        this._id.value,
        this._totalPrice.amountInCents,
        this._totalPrice.currency,
        reason,
      ),
    );
  }

  addItem(item: OrderItem): void {
    if (this._status.value !== OrderStatusEnum.CREATED) {
      throw new InvalidOrderOperationError(
        'addItem',
        `Cannot add items when order status is ${this._status.value}`,
      );
    }
    this._items.push(item);
    this._totalPrice = this.computeTotalPrice();
    this._updatedAt = new Date();
  }

  removeItem(productId: string): void {
    if (this._status.value !== OrderStatusEnum.CREATED) {
      throw new InvalidOrderOperationError(
        'removeItem',
        `Cannot remove items when order status is ${this._status.value}`,
      );
    }

    const index = this._items.findIndex((i) => i.productId === productId);
    if (index < 0) {
      throw new InvalidOrderOperationError(
        'removeItem',
        `Item with productId ${productId} not found`,
      );
    }

    this._items.splice(index, 1);
    this._totalPrice = this.computeTotalPrice();
    this._updatedAt = new Date();
  }

  // ─── Event Handling ──────────────────────────────────────────────────

  pullDomainEvents(): BaseDomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }

  // ─── Private Helpers ─────────────────────────────────────────────────

  private transitionStatus(target: OrderStatusEnum): void {
    if (!this._status.canTransitionTo(target)) {
      throw new InvalidOrderStatusTransitionError(this._status.value, target);
    }
    this._status = this._status.transitionTo(target);
    this._updatedAt = new Date();
  }

  private computeTotalPrice(): Money {
    return this._items.reduce(
      (sum, item) => sum.add(item.totalPrice),
      Money.zero(this._items[0]?.unitPrice.currency ?? 'USD'),
    );
  }

  // ─── Getters ─────────────────────────────────────────────────────────

  get id(): OrderId {
    return this._id;
  }

  get userId(): UserId {
    return this._userId;
  }

  get items(): OrderItem[] {
    return [...this._items];
  }

  get status(): OrderStatus {
    return this._status;
  }

  get totalPrice(): Money {
    return this._totalPrice;
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
      userId: this._userId.value,
      items: this._items.map((item) => item.toJSON()),
      status: this._status.value,
      totalPrice: this._totalPrice.toDecimal(),
      currency: this._totalPrice.currency,
      version: this._version,
      createdAt: this._createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString(),
    };
  }
}
