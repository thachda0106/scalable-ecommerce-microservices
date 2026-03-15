import { ProductInventory } from '../product-inventory';
import { InsufficientStockError } from '../../errors/insufficient-stock.error';

describe('ProductInventory Aggregate', () => {
  const createInventory = (available = 100) =>
    ProductInventory.create({
      productId: '550e8400-e29b-41d4-a716-446655440000',
      sku: 'WIDGET-001',
      initialStock: available,
      lowStockThreshold: 10,
    });

  describe('create()', () => {
    it('should create inventory with correct initial values', () => {
      const inv = createInventory(100);
      expect(inv.availableStock).toBe(100);
      expect(inv.reservedStock).toBe(0);
      expect(inv.soldStock).toBe(0);
      expect(inv.totalStock).toBe(100);
      expect(inv.version).toBe(1);
    });
  });

  describe('reserve()', () => {
    it('should decrement available and increment reserved', () => {
      const inv = createInventory(100);
      inv.reserve(10, 'res-1', 'cart-1', 'CART');
      expect(inv.availableStock).toBe(90);
      expect(inv.reservedStock).toBe(10);
      expect(inv.totalStock).toBe(100);
    });

    it('should throw InsufficientStockError when quantity exceeds available', () => {
      const inv = createInventory(5);
      expect(() => inv.reserve(10, 'res-1', 'cart-1', 'CART')).toThrow(
        InsufficientStockError,
      );
    });

    it('should emit StockReservedEvent', () => {
      const inv = createInventory(100);
      inv.reserve(10, 'res-1', 'cart-1', 'CART');
      const events = inv.pullEvents();
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].eventType).toBe('inventory.reserved');
    });

    it('should emit LowStockDetectedEvent when below threshold', () => {
      const inv = createInventory(15);
      inv.reserve(10, 'res-1', 'cart-1', 'CART');
      const events = inv.pullEvents();
      const lowStockEvent = events.find(
        (e) => e.eventType === 'inventory.low_stock',
      );
      expect(lowStockEvent).toBeDefined();
    });

    it('should NOT emit LowStockDetectedEvent when above threshold', () => {
      const inv = createInventory(100);
      inv.reserve(10, 'res-1', 'cart-1', 'CART');
      const events = inv.pullEvents();
      const lowStockEvent = events.find(
        (e) => e.eventType === 'inventory.low_stock',
      );
      expect(lowStockEvent).toBeUndefined();
    });
  });

  describe('release()', () => {
    it('should restore available and decrement reserved', () => {
      const inv = createInventory(100);
      inv.reserve(10, 'res-1', 'cart-1', 'CART');
      inv.pullEvents();
      inv.release(10, 'res-1', 'cart-1', 'cart_expired');
      expect(inv.availableStock).toBe(100);
      expect(inv.reservedStock).toBe(0);
      expect(inv.totalStock).toBe(100);
    });

    it('should throw when releasing more than reserved', () => {
      const inv = createInventory(100);
      expect(() => inv.release(10, 'res-1', 'cart-1', 'test')).toThrow();
    });

    it('should emit StockReleasedEvent', () => {
      const inv = createInventory(100);
      inv.reserve(10, 'res-1', 'cart-1', 'CART');
      inv.pullEvents();
      inv.release(10, 'res-1', 'cart-1', 'cancelled');
      const events = inv.pullEvents();
      expect(events[0].eventType).toBe('inventory.released');
    });
  });

  describe('confirm()', () => {
    it('should decrement reserved and increment sold', () => {
      const inv = createInventory(100);
      inv.reserve(10, 'res-1', 'order-1', 'ORDER');
      inv.pullEvents();
      inv.confirm(10, 'res-1', 'order-1');
      expect(inv.availableStock).toBe(90);
      expect(inv.reservedStock).toBe(0);
      expect(inv.soldStock).toBe(10);
      expect(inv.totalStock).toBe(100);
    });

    it('should throw when confirming more than reserved', () => {
      const inv = createInventory(100);
      expect(() => inv.confirm(10, 'res-1', 'order-1')).toThrow();
    });

    it('should emit StockConfirmedEvent', () => {
      const inv = createInventory(100);
      inv.reserve(10, 'res-1', 'order-1', 'ORDER');
      inv.pullEvents();
      inv.confirm(10, 'res-1', 'order-1');
      const events = inv.pullEvents();
      expect(events[0].eventType).toBe('inventory.confirmed');
    });
  });

  describe('replenish()', () => {
    it('should increase available and total', () => {
      const inv = createInventory(50);
      inv.replenish(100);
      expect(inv.availableStock).toBe(150);
      expect(inv.totalStock).toBe(150);
    });
  });

  describe('invariant', () => {
    it('should maintain available + reserved + sold = total through all operations', () => {
      const inv = createInventory(100);
      inv.reserve(30, 'r1', 'c1', 'CART');
      expect(inv.availableStock + inv.reservedStock + inv.soldStock).toBe(
        inv.totalStock,
      );
      inv.confirm(20, 'r2', 'o1');
      expect(inv.availableStock + inv.reservedStock + inv.soldStock).toBe(
        inv.totalStock,
      );
      inv.release(10, 'r3', 'c1', 'expired');
      expect(inv.availableStock + inv.reservedStock + inv.soldStock).toBe(
        inv.totalStock,
      );
      inv.replenish(50);
      expect(inv.availableStock + inv.reservedStock + inv.soldStock).toBe(
        inv.totalStock,
      );
    });
  });

  describe('pullEvents()', () => {
    it('should return empty after pulling', () => {
      const inv = createInventory(100);
      inv.reserve(10, 'r1', 'c1', 'CART');
      inv.pullEvents();
      expect(inv.pullEvents()).toHaveLength(0);
    });
  });
});
