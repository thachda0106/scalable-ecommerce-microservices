import { Money } from '../money.vo';
import { OrderStatus, OrderStatusEnum } from '../order-status.vo';
import { OrderId } from '../order-id.vo';
import { UserId } from '../user-id.vo';

describe('Value Objects', () => {
  describe('Money', () => {
    it('should create from decimal', () => {
      const money = Money.fromDecimal(19.99, 'USD');
      expect(money.amountInCents).toBe(1999);
      expect(money.toDecimal()).toBeCloseTo(19.99, 2);
    });

    it('should create from cents', () => {
      const money = Money.fromCents(1999, 'USD');
      expect(money.toDecimal()).toBeCloseTo(19.99, 2);
    });

    it('should add two Money values', () => {
      const a = Money.fromDecimal(10.5, 'USD');
      const b = Money.fromDecimal(5.25, 'USD');
      const result = a.add(b);
      expect(result.toDecimal()).toBeCloseTo(15.75, 2);
    });

    it('should multiply by quantity', () => {
      const money = Money.fromDecimal(9.99, 'USD');
      const result = money.multiply(3);
      expect(result.toDecimal()).toBeCloseTo(29.97, 2);
    });

    it('should throw on different currencies', () => {
      const usd = Money.fromDecimal(10, 'USD');
      const eur = Money.fromDecimal(10, 'EUR');
      expect(() => usd.add(eur)).toThrow(
        'Cannot operate on different currencies',
      );
    });

    it('should throw on negative amount', () => {
      expect(() => Money.fromCents(-1, 'USD')).toThrow('cannot be negative');
    });
  });

  describe('OrderStatus', () => {
    it('should allow valid transitions', () => {
      const status = OrderStatus.created();
      expect(status.canTransitionTo(OrderStatusEnum.PENDING_PAYMENT)).toBe(
        true,
      );
      expect(status.canTransitionTo(OrderStatusEnum.CANCELLED)).toBe(true);
    });

    it('should reject invalid transitions', () => {
      const status = OrderStatus.created();
      expect(status.canTransitionTo(OrderStatusEnum.PAID)).toBe(false);
      expect(status.canTransitionTo(OrderStatusEnum.SHIPPED)).toBe(false);
    });

    it('should identify terminal states', () => {
      const cancelled = OrderStatus.create(OrderStatusEnum.CANCELLED);
      const refunded = OrderStatus.create(OrderStatusEnum.REFUNDED);
      expect(cancelled.isTerminal()).toBe(true);
      expect(refunded.isTerminal()).toBe(true);
    });

    it('should transition correctly', () => {
      const status = OrderStatus.created();
      const next = status.transitionTo(OrderStatusEnum.PENDING_PAYMENT);
      expect(next.value).toBe(OrderStatusEnum.PENDING_PAYMENT);
    });

    it('should throw on invalid transition', () => {
      const status = OrderStatus.created();
      expect(() => status.transitionTo(OrderStatusEnum.DELIVERED)).toThrow();
    });
  });

  describe('OrderId', () => {
    it('should generate unique ids', () => {
      const a = OrderId.generate();
      const b = OrderId.generate();
      expect(a.equals(b)).toBe(false);
    });

    it('should throw on empty value', () => {
      expect(() => OrderId.create('')).toThrow('cannot be empty');
    });
  });

  describe('UserId', () => {
    it('should create from string', () => {
      const userId = UserId.create('user-123');
      expect(userId.value).toBe('user-123');
    });

    it('should throw on empty value', () => {
      expect(() => UserId.create('')).toThrow('cannot be empty');
    });
  });
});
