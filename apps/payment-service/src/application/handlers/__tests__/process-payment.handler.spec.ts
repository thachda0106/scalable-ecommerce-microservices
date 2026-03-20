jest.mock('uuid', () => ({ v4: () => 'test-uuid-123' }));

import { ProcessPaymentHandler } from '../process-payment.handler';
import { ProcessPaymentCommand } from '../../commands/process-payment.command';
import { PaymentProviderEnum } from '../../../domain/enums/payment-provider.enum';
import { PaymentStatusEnum } from '../../../domain/value-objects/payment-status.vo';

describe('ProcessPaymentHandler', () => {
  let handler: ProcessPaymentHandler;
  let mockPaymentRepo: any;
  let mockProviderFactory: any;
  let mockEventPublisher: any;
  let mockMetricsService: any;
  let mockProvider: any;

  beforeEach(() => {
    mockPaymentRepo = {
      save: jest.fn().mockResolvedValue(undefined),
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
    };

    mockProvider = {
      processPayment: jest.fn(),
      refundPayment: jest.fn(),
      getName: jest.fn().mockReturnValue(PaymentProviderEnum.MOCK),
    };

    mockProviderFactory = {
      getProvider: jest.fn().mockReturnValue(mockProvider),
    };

    mockEventPublisher = {
      publish: jest.fn(),
      publishAll: jest.fn(),
    };

    mockMetricsService = {
      incrementProcessing: jest.fn(),
      incrementSuccess: jest.fn(),
      incrementFailure: jest.fn(),
      startProcessingTimer: jest.fn().mockReturnValue(jest.fn()),
    };

    handler = new ProcessPaymentHandler(
      mockPaymentRepo,
      mockProviderFactory,
      mockEventPublisher,
      mockMetricsService,
    );
  });

  it('should process payment successfully', async () => {
    const command = new ProcessPaymentCommand(
      'order-1',
      'user-1',
      1000,
      'USD',
      'MOCK',
      'idem-key-1',
    );

    mockProvider.processPayment.mockResolvedValue({
      success: true,
      transactionId: 'tx-mock-123',
    });

    const result = await handler.execute(command);

    expect(result.status).toBe(PaymentStatusEnum.SUCCESS);
    expect(result.transactionId).toBe('tx-mock-123');

    // Expect save to be called 3 times (create, startProcessing, complete)
    expect(mockPaymentRepo.save).toHaveBeenCalledTimes(3);

    // Expect 3 events to be published (created, processing, completed)
    expect(mockEventPublisher.publishAll).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ eventType: 'PaymentCreated' }),
        expect.objectContaining({ eventType: 'PaymentProcessing' }),
        expect.objectContaining({ eventType: 'PaymentCompleted' }),
      ]),
    );

    expect(mockMetricsService.incrementSuccess).toHaveBeenCalled();
  });

  it('should fail payment if provider fails', async () => {
    const command = new ProcessPaymentCommand(
      'order-1',
      'user-1',
      1000,
      'USD',
      'MOCK',
      'idem-key-1',
    );

    mockProvider.processPayment.mockResolvedValue({
      success: false,
    });

    const result = await handler.execute(command);

    expect(result.status).toBe(PaymentStatusEnum.FAILED);
    expect(mockMetricsService.incrementFailure).toHaveBeenCalled();
  });

  it('should return idempotent success if already processed', async () => {
    const command = new ProcessPaymentCommand(
      'o1',
      'u1',
      1000,
      'USD',
      'MOCK',
      'key1',
    );
    const existingPayment = {
      status: { value: PaymentStatusEnum.SUCCESS },
      toJSON: () => ({
        status: PaymentStatusEnum.SUCCESS,
        idempotencyKey: 'key1',
      }),
    };

    mockPaymentRepo.findByIdempotencyKey.mockResolvedValue(existingPayment);

    const result = await handler.execute(command);

    expect(result.status).toBe(PaymentStatusEnum.SUCCESS);
    expect(mockProvider.processPayment).not.toHaveBeenCalled();
    expect(mockPaymentRepo.save).not.toHaveBeenCalled();
  });
});
