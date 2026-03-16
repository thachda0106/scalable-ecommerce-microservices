import { CreateOrderHandler } from '../create-order.handler';
import { CreateOrderCommand } from '../../commands/create-order.command';
import { IOrderRepository } from '../../../domain/ports/order-repository.port';
import { IEventPublisher } from '../../../application/ports/event-publisher.port';
import { OrderId } from '../../../domain/value-objects/order-id.vo';
import { Order } from '../../../domain/entities/order.entity';

describe('CreateOrderHandler', () => {
  let handler: CreateOrderHandler;
  let orderRepository: jest.Mocked<IOrderRepository>;
  let eventPublisher: jest.Mocked<IEventPublisher>;

  beforeEach(() => {
    orderRepository = {
      save: jest.fn(),
      findById: jest.fn(),
      findByUserId: jest.fn(),
      findByStatus: jest.fn(),
      nextId: jest.fn().mockReturnValue({ value: '123e4567-e89b-12d3-a456-426614174000' } as any),
    };

    eventPublisher = {
      publish: jest.fn(),
      publishAll: jest.fn(),
    };

    handler = new CreateOrderHandler(orderRepository, eventPublisher);
  });

  it('should create an order, save it, and publish events', async () => {
    const command = new CreateOrderCommand('user-1', [
      { productId: 'prod-1', productName: 'Product 1', quantity: 2, unitPrice: 100 },
    ]);

    const orderId = await handler.execute(command);

    expect(orderId).toBeDefined();
    expect(orderRepository.save).toHaveBeenCalledTimes(1);
    expect(eventPublisher.publishAll).toHaveBeenCalledTimes(1);
    
    // Verify the aggregate was saved correctly
    const savedOrder = orderRepository.save.mock.calls[0][0] as Order;
    expect(savedOrder.userId.value).toBe('user-1');
    expect(savedOrder.items.length).toBe(1);
    expect(savedOrder.totalPrice.amountInCents).toBe(20000);
  });
});
