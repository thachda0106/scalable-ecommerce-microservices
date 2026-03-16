import { CancelOrderHandler } from '../cancel-order.handler';
import { CancelOrderCommand } from '../../commands/cancel-order.command';
import { IOrderRepository } from '../../../domain/ports/order-repository.port';
import { IEventPublisher } from '../../../application/ports/event-publisher.port';
import { OrderId } from '../../../domain/value-objects/order-id.vo';
import { Order } from '../../../domain/entities/order.entity';
import { OrderItem } from '../../../domain/entities/order-item.entity';
import { Money } from '../../../domain/value-objects/money.vo';
import { OrderMetricsService } from '../../../infrastructure/observability/order-metrics.service';

describe('CancelOrderHandler', () => {
  let handler: CancelOrderHandler;
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

    handler = new CancelOrderHandler(orderRepository, eventPublisher, metrics);
  });

  it('should cancel an existing order', async () => {
    const order = Order.create({
      userId: 'user-1',
      items: [
        {
          productId: 'prod-1',
          productName: 'Product 1',
          quantity: 1,
          unitPrice: 100, // as decimal since Order.create does Money.fromDecimal internally!
        },
      ],
    });
    
    orderRepository.findById.mockResolvedValue(order);

    const command = new CancelOrderCommand(order.id.value, 'User requested cancellation');

    await handler.execute(command);

    expect(orderRepository.save).toHaveBeenCalledTimes(1);
    expect(eventPublisher.publishAll).toHaveBeenCalledTimes(1);
    expect(metrics.recordStatusChange).toHaveBeenCalledWith('CREATED', 'CANCELLED');
    
    const savedOrder = orderRepository.save.mock.calls[0][0] as Order;
    expect(savedOrder.status.value).toBe('CANCELLED');
  });

  it('should throw if order is not found', async () => {
    orderRepository.findById.mockResolvedValue(null);

    const command = new CancelOrderCommand('123e4567-e89b-12d3-a456-426614174000', 'Reason');

    await expect(handler.execute(command)).rejects.toThrow(/not found/);
  });
});
