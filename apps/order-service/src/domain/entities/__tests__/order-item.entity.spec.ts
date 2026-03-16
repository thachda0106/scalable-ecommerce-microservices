import { OrderItem } from '../order-item.entity';
import { Money } from '../../value-objects/money.vo';

describe('OrderItem', () => {
  it('should create a valid order item', () => {
    const item = OrderItem.create({
      productId: 'prod-1',
      productName: 'Test Product',
      quantity: 2,
      unitPrice: Money.fromCents(100),
    });

    expect(item.productId).toBe('prod-1');
    expect(item.productName).toBe('Test Product');
    expect(item.quantity).toBe(2);
    expect(item.unitPrice.equals(Money.fromCents(100))).toBe(true);
    expect(item.totalPrice.equals(Money.fromCents(200))).toBe(true);
  });

  it('should throw if quantity is less than or equal to 0', () => {
    expect(() => {
      OrderItem.create({
        productId: 'prod-1',
        productName: 'Test Product',
        quantity: 0,
        unitPrice: Money.fromCents(100),
      });
    }).toThrow('OrderItem quantity must be greater than 0');
  });

  it('should throw if unitPrice is negative', () => {
    expect(() => {
      OrderItem.create({
        productId: 'prod-1',
        productName: 'Test Product',
        quantity: 1,
        unitPrice: Money.fromCents(-50),
      });
    }).toThrow('Money amount cannot be negative');
  });
});
