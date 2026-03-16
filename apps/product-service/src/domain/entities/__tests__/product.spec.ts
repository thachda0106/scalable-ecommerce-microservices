import { Product } from '../product.entity';
import { ProductStatusEnum } from '../../value-objects/product-status.vo';
import { InvalidProductOperationError } from '../../errors/invalid-product-operation.error';
import { InvalidProductStatusTransitionError } from '../../errors/invalid-product-status-transition.error';
import { ProductCreatedEvent } from '../../events/product-created.event';
import { ProductUpdatedEvent } from '../../events/product-updated.event';
import { ProductStockUpdatedEvent } from '../../events/product-stock-updated.event';

describe('Product Aggregate', () => {
  const validProps = {
    name: 'Test Product',
    description: 'A test product description',
    price: 29.99,
    currency: 'USD',
    categoryId: 'cat-123',
  };

  describe('create', () => {
    it('should create a product with valid props', () => {
      const product = Product.create(validProps);

      expect(product.name).toBe('Test Product');
      expect(product.description).toBe('A test product description');
      expect(product.price.toDecimal()).toBe(29.99);
      expect(product.price.currency).toBe('USD');
      expect(product.categoryId).toBe('cat-123');
      expect(product.status.value).toBe(ProductStatusEnum.ACTIVE);
      expect(product.version).toBe(1);
    });

    it('should raise ProductCreatedEvent on creation', () => {
      const product = Product.create(validProps);
      const events = product.pullDomainEvents();

      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(ProductCreatedEvent);
      expect((events[0] as ProductCreatedEvent).name).toBe('Test Product');
    });

    it('should reject creation with empty name', () => {
      expect(() =>
        Product.create({ ...validProps, name: '' }),
      ).toThrow(InvalidProductOperationError);
    });

    it('should reject creation with zero price', () => {
      expect(() =>
        Product.create({ ...validProps, price: 0 }),
      ).toThrow(InvalidProductOperationError);
    });

    it('should reject creation with negative price', () => {
      expect(() =>
        Product.create({ ...validProps, price: -5 }),
      ).toThrow(InvalidProductOperationError);
    });
  });

  describe('updateDetails', () => {
    it('should update product name and description', () => {
      const product = Product.create(validProps);
      product.pullDomainEvents(); // clear creation event

      product.updateDetails({ name: 'Updated Name', description: 'Updated desc' });

      expect(product.name).toBe('Updated Name');
      expect(product.description).toBe('Updated desc');
    });

    it('should raise ProductUpdatedEvent', () => {
      const product = Product.create(validProps);
      product.pullDomainEvents();

      product.updateDetails({ name: 'Updated Name' });
      const events = product.pullDomainEvents();

      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(ProductUpdatedEvent);
    });

    it('should throw when updating archived product', () => {
      const product = Product.create(validProps);
      product.archive();
      product.pullDomainEvents();

      expect(() =>
        product.updateDetails({ name: 'New name' }),
      ).toThrow(InvalidProductOperationError);
    });
  });

  describe('status transitions', () => {
    it('should activate an inactive product', () => {
      const product = Product.create(validProps);
      product.deactivate();
      product.activate();

      expect(product.status.value).toBe(ProductStatusEnum.ACTIVE);
    });

    it('should deactivate an active product', () => {
      const product = Product.create(validProps);
      product.deactivate();

      expect(product.status.value).toBe(ProductStatusEnum.INACTIVE);
    });

    it('should mark product as out of stock', () => {
      const product = Product.create(validProps);
      product.markOutOfStock();

      expect(product.status.value).toBe(ProductStatusEnum.OUT_OF_STOCK);
    });

    it('should raise ProductStockUpdatedEvent on markOutOfStock', () => {
      const product = Product.create(validProps);
      product.pullDomainEvents();

      product.markOutOfStock();
      const events = product.pullDomainEvents();

      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(ProductStockUpdatedEvent);
    });

    it('should restock an out-of-stock product', () => {
      const product = Product.create(validProps);
      product.markOutOfStock();
      product.restock();

      expect(product.status.value).toBe(ProductStatusEnum.ACTIVE);
    });

    it('should archive a product', () => {
      const product = Product.create(validProps);
      product.archive();

      expect(product.status.value).toBe(ProductStatusEnum.ARCHIVED);
    });

    it('should throw when archiving an already archived product', () => {
      const product = Product.create(validProps);
      product.archive();

      expect(() => product.archive()).toThrow(InvalidProductStatusTransitionError);
    });
  });

  describe('pullDomainEvents', () => {
    it('should return and clear domain events', () => {
      const product = Product.create(validProps);
      const events = product.pullDomainEvents();

      expect(events).toHaveLength(1);
      expect(product.pullDomainEvents()).toHaveLength(0);
    });
  });

  describe('reconstitute', () => {
    it('should rebuild product without raising events', () => {
      const product = Product.reconstitute({
        id: 'test-id',
        name: 'Restored Product',
        description: 'desc',
        priceInCents: 2999,
        currency: 'USD',
        categoryId: 'cat-1',
        status: ProductStatusEnum.ACTIVE,
        version: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(product.name).toBe('Restored Product');
      expect(product.pullDomainEvents()).toHaveLength(0);
    });
  });

  describe('toJSON', () => {
    it('should serialize product to plain object', () => {
      const product = Product.create(validProps);
      const json = product.toJSON();

      expect(json.name).toBe('Test Product');
      expect(json.price).toBe(29.99);
      expect(json.status).toBe('ACTIVE');
      expect(json.id).toBeDefined();
    });
  });
});
