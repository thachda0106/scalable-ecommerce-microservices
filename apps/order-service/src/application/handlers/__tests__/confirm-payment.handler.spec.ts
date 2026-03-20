import { ConfirmPaymentHandler } from '../confirm-payment.handler';
import { ConfirmPaymentCommand } from '../../commands/confirm-payment.command';
import { IOrderRepository } from '../../../domain/ports/order-repository.port';
import { IEventPublisher } from '../../../application/ports/event-publisher.port';
import { OrderId } from '../../../domain/value-objects/order-id.vo';
import { Order } from '../../../domain/entities/order.entity';
import { OrderMetricsService } from '../../../infrastructure/observability/order-metrics.service';

describe('ConfirmPaymentHandler', () => {
  let handler: ConfirmPaymentHandler;
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

    handler = new ConfirmPaymentHandler(
      orderRepository,
      eventPublisher,
      metrics,
    );
  });

  it('should confirm payment for an existing order', async () => {
    const order = Order.create({
      userId: 'user-1',
      items: [
        {
          productId: 'prod-1',
          productName: 'Product 1',
          quantity: 1,
          unitPrice: 100,
        },
      ],
    });

    order.requestPayment(); // transitions to PENDING_PAYMENT
    orderRepository.findById.mockResolvedValue(order);

    const command = new ConfirmPaymentCommand(order.id.value, 'payment-123');

    await handler.execute(command);

    expect(orderRepository.findById).toHaveBeenCalledWith(expect.any(OrderId));
    expect(orderRepository.save).toHaveBeenCalledTimes(1);
    expect(eventPublisher.publishAll).toHaveBeenCalledTimes(1);
    expect(metrics.recordStatusChange).toHaveBeenCalledWith(
      'PENDING_PAYMENT',
      'PAID',
    );

    const savedOrder = orderRepository.save.mock.calls[0][0] as Order;
    expect(savedOrder.status.value).toBe('PAID');
  });

  it('should throw if order is not found', async () => {
    orderRepository.findById.mockResolvedValue(null);

    const command = new ConfirmPaymentCommand(
      '123e4567-e89b-12d3-a456-426614174000',
      'payment-123',
    );

    await expect(handler.execute(command)).rejects.toThrow(/not found/);
  });
});
