import { CreateOrderHandler } from '../create-order.handler';
import { CreateOrderCommand } from '../../commands/create-order.command';
import { IOrderRepository } from '../../../domain/ports/order-repository.port';
import { IEventPublisher } from '../../../application/ports/event-publisher.port';
import { OrderId } from '../../../domain/value-objects/order-id.vo';
import { Order } from '../../../domain/entities/order.entity';
import { OrderMetricsService } from '../../../infrastructure/observability/order-metrics.service';

describe('CreateOrderHandler', () => {
  let handler: CreateOrderHandler;
  let orderRepository: jest.Mocked<IOrderRepository>;
  let eventPublisher: jest.Mocked<IEventPublisher>;
  let metrics: jest.Mocked<OrderMetricsService>;

  beforeEach(() => {
    orderRepository = {
      save: jest.fn(),
      findById: jest.fn(),
      findByUserId: jest.fn(),
      findByStatus: jest.fn(),
    };

    eventPublisher = {
      publish: jest.fn(),
      publishAll: jest.fn(),
    };

    metrics = {
      incrementOrdersCreated: jest.fn(),
      recordStatusChange: jest.fn(),
      startTimer: jest.fn().mockReturnValue(jest.fn()),
      setActiveOrders: jest.fn(),
      getMetrics: jest.fn(),
    } as any;

    handler = new CreateOrderHandler(orderRepository, eventPublisher, metrics);
  });

  it('should create an order, save it, and publish events', async () => {
    const command = new CreateOrderCommand('user-1', [
      { productId: 'prod-1', productName: 'Product 1', quantity: 2, unitPrice: 100 },
    ]);

    const orderId = await handler.execute(command);

    expect(orderId).toBeDefined();
    expect(orderRepository.save).toHaveBeenCalledTimes(1);
    expect(eventPublisher.publishAll).toHaveBeenCalledTimes(1);
    expect(metrics.incrementOrdersCreated).toHaveBeenCalledTimes(1);
    expect(metrics.startTimer).toHaveBeenCalledWith('create_order');
    
    // Verify the aggregate was saved correctly
    const savedOrder = orderRepository.save.mock.calls[0][0] as Order;
    expect(savedOrder.userId.value).toBe('user-1');
    expect(savedOrder.items.length).toBe(1);
    expect(savedOrder.totalPrice.amountInCents).toBe(20000);
  });
});
