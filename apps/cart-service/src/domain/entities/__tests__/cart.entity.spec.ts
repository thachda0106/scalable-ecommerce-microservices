import { Cart } from '../cart.entity';
import { ProductId } from '../../value-objects/product-id.vo';
import { Quantity } from '../../value-objects/quantity.vo';
import { ItemNotInCartException } from '../../exceptions';
import { InvalidProductIdException } from '../../exceptions';
import { InvalidQuantityException } from '../../exceptions';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_UUID_2 = '660e8400-e29b-41d4-a716-446655440001';

describe('Cart Aggregate', () => {
  const pid = ProductId.create(VALID_UUID);
  const pid2 = ProductId.create(VALID_UUID_2);
  const qty1 = Quantity.create(1);
  const qty3 = Quantity.create(3);

  it('should create a cart with a unique id and empty items', () => {
    const cart = Cart.create('user-123');
    expect(cart.id).toBeDefined();
    expect(cart.userId).toBe('user-123');
    expect(cart.items).toHaveLength(0);
  });

  it('should generate unique ids for each cart', () => {
    const cart1 = Cart.create('user-1');
    const cart2 = Cart.create('user-2');
    expect(cart1.id).not.toBe(cart2.id);
  });

  it('should add a new item to the cart', () => {
    const cart = Cart.create('user-123');
    cart.addItem(pid, qty1, 29.99);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].quantity.getValue()).toBe(1);
    expect(cart.items[0].snapshottedPrice).toBe(29.99);
  });

  it('should merge quantity when adding a duplicate item', () => {
    const cart = Cart.create('user-123');
    cart.addItem(pid, qty1, 29.99);
    cart.addItem(pid, qty3, 29.99);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].quantity.getValue()).toBe(4);
  });

  it('should add two different items without merging', () => {
    const cart = Cart.create('user-123');
    cart.addItem(pid, qty1, 29.99);
    cart.addItem(pid2, qty3, 9.99);
    expect(cart.items).toHaveLength(2);
  });

  it('should throw when merged quantity exceeds 99', () => {
    const cart = Cart.create('user-123');
    const qty50 = Quantity.create(50);
    cart.addItem(pid, qty50, 9.99);
    expect(() => cart.addItem(pid, qty50, 9.99)).toThrow();
  });

  it('should emit ItemAddedEvent on addItem', () => {
    const cart = Cart.create('user-123');
    cart.addItem(pid, qty1, 9.99);
    const events = cart.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('cart.item_added');
  });

  it('should remove an existing item', () => {
    const cart = Cart.create('user-123');
    cart.addItem(pid, qty1, 9.99);
    cart.pullEvents(); // drain
    cart.removeItem(pid);
    expect(cart.items).toHaveLength(0);
  });

  it('should emit ItemRemovedEvent on removeItem', () => {
    const cart = Cart.create('user-123');
    cart.addItem(pid, qty1, 9.99);
    cart.pullEvents(); // drain
    cart.removeItem(pid);
    const events = cart.pullEvents();
    expect(events[0].eventType).toBe('cart.item_removed');
  });

  it('should throw ItemNotInCartException when removing an item not in cart', () => {
    const cart = Cart.create('user-123');
    expect(() => cart.removeItem(pid)).toThrow(ItemNotInCartException);
  });

  it('should clear all items', () => {
    const cart = Cart.create('user-123');
    cart.addItem(pid, qty1, 9.99);
    cart.addItem(pid2, qty3, 19.99);
    cart.pullEvents(); // drain
    cart.clear();
    expect(cart.items).toHaveLength(0);
  });

  it('should emit CartClearedEvent on clear', () => {
    const cart = Cart.create('user-123');
    cart.addItem(pid, qty1, 9.99);
    cart.pullEvents(); // drain
    cart.clear();
    const events = cart.pullEvents();
    expect(events[0].eventType).toBe('cart.cleared');
  });

  it('should return empty events after pullEvents()', () => {
    const cart = Cart.create('user-123');
    cart.addItem(pid, qty1, 9.99);
    cart.pullEvents();
    expect(cart.pullEvents()).toHaveLength(0);
  });

  it('should reconstitute cart without emitting events', () => {
    const cart = Cart.reconstitute('cart-id-123', 'user-123', []);
    expect(cart.id).toBe('cart-id-123');
    expect(cart.pullEvents()).toHaveLength(0);
  });
});

describe('ProductId VO', () => {
  it('should accept valid UUID v4', () => {
    expect(() => ProductId.create(VALID_UUID)).not.toThrow();
  });

  it('should reject invalid UUID with InvalidProductIdException', () => {
    expect(() => ProductId.create('not-a-uuid')).toThrow(
      InvalidProductIdException,
    );
  });

  it('should reject UUID v1', () => {
    expect(() =>
      ProductId.create('550e8400-e29b-11d4-a716-446655440000'),
    ).toThrow(InvalidProductIdException);
  });

  it('same value should be equal', () => {
    const a = ProductId.create(VALID_UUID);
    const b = ProductId.create(VALID_UUID);
    expect(a.equals(b)).toBe(true);
  });
});

describe('Quantity VO', () => {
  it('should accept 1', () => expect(() => Quantity.create(1)).not.toThrow());
  it('should accept 99', () => expect(() => Quantity.create(99)).not.toThrow());
  it('should reject 0', () =>
    expect(() => Quantity.create(0)).toThrow(InvalidQuantityException));
  it('should reject 100', () =>
    expect(() => Quantity.create(100)).toThrow(InvalidQuantityException));
  it('should reject decimals', () =>
    expect(() => Quantity.create(1.5)).toThrow(InvalidQuantityException));
  it('should reject negative', () =>
    expect(() => Quantity.create(-1)).toThrow(InvalidQuantityException));

  it('Quantity.add should merge values', () => {
    const a = Quantity.create(10);
    const b = Quantity.create(20);
    expect(a.add(b).getValue()).toBe(30);
  });

  it('Quantity.add should throw when result > 99', () => {
    const a = Quantity.create(50);
    const b = Quantity.create(50);
    expect(() => a.add(b)).toThrow();
  });
});
