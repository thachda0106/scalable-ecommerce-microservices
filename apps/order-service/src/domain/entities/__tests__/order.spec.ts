import { Order, CreateOrderProps } from '../order.entity';
import { OrderItem } from '../order-item.entity';
import { OrderStatusEnum } from '../../value-objects/order-status.vo';
import { InvalidOrderStatusTransitionError } from '../../errors/invalid-order-status-transition.error';
import { InvalidOrderOperationError } from '../../errors/invalid-order-operation.error';

describe('Order Aggregate', () => {
  const validCreateProps: CreateOrderProps = {
    userId: 'user-123',
    items: [
      { productId: 'prod-1', productName: 'Widget', quantity: 2, unitPrice: 19.99 },
      { productId: 'prod-2', productName: 'Gadget', quantity: 1, unitPrice: 49.99 },
    ],
  };

  describe('create()', () => {
    it('should create an order with CREATED status', () => {
      const order = Order.create(validCreateProps);

      expect(order.id).toBeDefined();
      expect(order.userId.value).toBe('user-123');
      expect(order.status.value).toBe(OrderStatusEnum.CREATED);
      expect(order.items).toHaveLength(2);
      expect(order.version).toBe(1);
    });

    it('should compute total price from items', () => {
      const order = Order.create(validCreateProps);
      // 2 * 19.99 + 1 * 49.99 = 89.97
      expect(order.totalPrice.toDecimal()).toBeCloseTo(89.97, 2);
    });

    it('should raise OrderCreatedEvent', () => {
      const order = Order.create(validCreateProps);
      const events = order.pullDomainEvents();

      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('order.created');
    });

    it('should throw if no items', () => {
      expect(() => Order.create({ userId: 'u1', items: [] })).toThrow(
        InvalidOrderOperationError,
      );
    });
  });

  describe('status transitions', () => {
    it('should transition CREATED → PENDING_PAYMENT', () => {
      const order = Order.create(validCreateProps);
      order.pullDomainEvents(); // clear events

      order.requestPayment();

      expect(order.status.value).toBe(OrderStatusEnum.PENDING_PAYMENT);
      const events = order.pullDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('order.payment.requested');
    });

    it('should transition PENDING_PAYMENT → PAID', () => {
      const order = Order.create(validCreateProps);
      order.requestPayment();
      order.pullDomainEvents();

      order.confirmPayment('pay-123');

      expect(order.status.value).toBe(OrderStatusEnum.PAID);
      const events = order.pullDomainEvents();
      expect(events[0].eventType).toBe('order.paid');
    });

    it('should transition PAID → CONFIRMED', () => {
      const order = Order.create(validCreateProps);
      order.requestPayment();
      order.confirmPayment('pay-123');
      order.pullDomainEvents();

      order.confirm();

      expect(order.status.value).toBe(OrderStatusEnum.CONFIRMED);
    });

    it('should transition CONFIRMED → SHIPPED', () => {
      const order = Order.create(validCreateProps);
      order.requestPayment();
      order.confirmPayment('pay-123');
      order.confirm();
      order.pullDomainEvents();

      order.ship('TRACK-001');

      expect(order.status.value).toBe(OrderStatusEnum.SHIPPED);
    });

    it('should transition SHIPPED → DELIVERED', () => {
      const order = Order.create(validCreateProps);
      order.requestPayment();
      order.confirmPayment('pay-123');
      order.confirm();
      order.ship('TRACK-001');
      order.pullDomainEvents();

      order.deliver();

      expect(order.status.value).toBe(OrderStatusEnum.DELIVERED);
    });

    it('should not allow invalid transition CREATED → PAID', () => {
      const order = Order.create(validCreateProps);

      expect(() => order.confirmPayment('pay-123')).toThrow(
        InvalidOrderStatusTransitionError,
      );
    });

    it('should transition to CANCELLED from CREATED', () => {
      const order = Order.create(validCreateProps);
      order.pullDomainEvents();

      order.cancel('Changed mind');

      expect(order.status.value).toBe(OrderStatusEnum.CANCELLED);
      const events = order.pullDomainEvents();
      expect(events[0].eventType).toBe('order.cancelled');
    });

    it('should transition to REFUNDED from DELIVERED', () => {
      const order = Order.create(validCreateProps);
      order.requestPayment();
      order.confirmPayment('pay-1');
      order.confirm();
      order.ship('T-1');
      order.deliver();
      order.pullDomainEvents();

      order.refund('Defective');

      expect(order.status.value).toBe(OrderStatusEnum.REFUNDED);
    });
  });

  describe('item operations', () => {
    it('should not allow addItem when status is not CREATED', () => {
      const order = Order.create(validCreateProps);
      order.requestPayment();

      expect(() =>
        order.addItem(
          OrderItem.create({
            productId: 'p3',
            productName: 'Test',
            quantity: 1,
            unitPrice: { amountInCents: 100, currency: 'USD', toDecimal: () => 1, isPositive: () => true } as any,
          }),
        ),
      ).toThrow(InvalidOrderOperationError);
    });
  });

  describe('toJSON()', () => {
    it('should serialize to plain object', () => {
      const order = Order.create(validCreateProps);
      const json = order.toJSON();

      expect(json.id).toBeDefined();
      expect(json.userId).toBe('user-123');
      expect(json.status).toBe('CREATED');
      expect(json.items).toHaveLength(2);
      expect(json.totalPrice).toBeCloseTo(89.97, 2);
    });
  });
});
