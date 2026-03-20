import { InvalidOrderStatusTransitionError } from '../errors/invalid-order-status-transition.error';

export enum OrderStatusEnum {
  CREATED = 'CREATED',
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PAID = 'PAID',
  CONFIRMED = 'CONFIRMED',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

const VALID_TRANSITIONS: Map<OrderStatusEnum, OrderStatusEnum[]> = new Map([
  [
    OrderStatusEnum.CREATED,
    [OrderStatusEnum.PENDING_PAYMENT, OrderStatusEnum.CANCELLED],
  ],
  [
    OrderStatusEnum.PENDING_PAYMENT,
    [OrderStatusEnum.PAID, OrderStatusEnum.CANCELLED],
  ],
  [OrderStatusEnum.PAID, [OrderStatusEnum.CONFIRMED, OrderStatusEnum.REFUNDED]],
  [
    OrderStatusEnum.CONFIRMED,
    [OrderStatusEnum.SHIPPED, OrderStatusEnum.CANCELLED],
  ],
  [OrderStatusEnum.SHIPPED, [OrderStatusEnum.DELIVERED]],
  [OrderStatusEnum.DELIVERED, [OrderStatusEnum.REFUNDED]],
  [OrderStatusEnum.CANCELLED, []],
  [OrderStatusEnum.REFUNDED, []],
]);

export class OrderStatus {
  private readonly _value: OrderStatusEnum;

  private constructor(value: OrderStatusEnum) {
    this._value = value;
  }

  static create(value: OrderStatusEnum): OrderStatus {
    return new OrderStatus(value);
  }

  static created(): OrderStatus {
    return new OrderStatus(OrderStatusEnum.CREATED);
  }

  get value(): OrderStatusEnum {
    return this._value;
  }

  canTransitionTo(target: OrderStatusEnum): boolean {
    const allowed = VALID_TRANSITIONS.get(this._value) ?? [];
    return allowed.includes(target);
  }

  transitionTo(target: OrderStatusEnum): OrderStatus {
    if (!this.canTransitionTo(target)) {
      throw new InvalidOrderStatusTransitionError(this._value, target);
    }
    return new OrderStatus(target);
  }

  isTerminal(): boolean {
    return (
      this._value === OrderStatusEnum.CANCELLED ||
      this._value === OrderStatusEnum.REFUNDED
    );
  }

  equals(other: OrderStatus): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
