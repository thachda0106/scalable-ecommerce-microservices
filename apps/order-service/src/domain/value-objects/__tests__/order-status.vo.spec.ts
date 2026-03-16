import { OrderStatus, OrderStatusEnum } from '../order-status.vo';

describe('OrderStatus Value Object', () => {
  it('should construct with valid status', () => {
    const status = OrderStatus.create(OrderStatusEnum.CREATED);
    expect(status.value).toBe(OrderStatusEnum.CREATED);
  });

  it('should compare equality correctly', () => {
    const status1 = OrderStatus.created();
    const status2 = OrderStatus.created();
    const status3 = OrderStatus.create(OrderStatusEnum.PAID);

    expect(status1.equals(status2)).toBe(true);
    expect(status1.equals(status3)).toBe(false);
  });

  it('should allow valid transitions', () => {
    expect(OrderStatus.created().canTransitionTo(OrderStatusEnum.PENDING_PAYMENT)).toBe(true);
    expect(OrderStatus.created().canTransitionTo(OrderStatusEnum.CANCELLED)).toBe(true);
    expect(OrderStatus.create(OrderStatusEnum.PENDING_PAYMENT).canTransitionTo(OrderStatusEnum.PAID)).toBe(true);
    expect(OrderStatus.create(OrderStatusEnum.PAID).canTransitionTo(OrderStatusEnum.CONFIRMED)).toBe(true);
    expect(OrderStatus.create(OrderStatusEnum.CONFIRMED).canTransitionTo(OrderStatusEnum.SHIPPED)).toBe(true);
    expect(OrderStatus.create(OrderStatusEnum.SHIPPED).canTransitionTo(OrderStatusEnum.DELIVERED)).toBe(true);
    expect(OrderStatus.create(OrderStatusEnum.DELIVERED).canTransitionTo(OrderStatusEnum.REFUNDED)).toBe(true);
  });

  it('should deny invalid transitions', () => {
    expect(OrderStatus.created().canTransitionTo(OrderStatusEnum.DELIVERED)).toBe(false);
    expect(OrderStatus.create(OrderStatusEnum.PAID).canTransitionTo(OrderStatusEnum.CREATED)).toBe(false);
    expect(OrderStatus.create(OrderStatusEnum.CANCELLED).canTransitionTo(OrderStatusEnum.PAID)).toBe(false);
    expect(OrderStatus.create(OrderStatusEnum.REFUNDED).canTransitionTo(OrderStatusEnum.CONFIRMED)).toBe(false);
  });

  it('should determine terminal states correctly', () => {
    const cancelled = OrderStatus.create(OrderStatusEnum.CANCELLED);
    const refunded = OrderStatus.create(OrderStatusEnum.REFUNDED);
    const created = OrderStatus.created();

    expect(cancelled.isTerminal()).toBe(true);
    expect(refunded.isTerminal()).toBe(true);
    expect(created.isTerminal()).toBe(false);
  });
});
