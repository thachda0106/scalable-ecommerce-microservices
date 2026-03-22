import { InboxService } from '../inbox.service';
import { InboxEventStatus } from '../inbox.types';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockTryInsert = jest.fn();
const mockMarkProcessing = jest.fn();
const mockMarkProcessed = jest.fn();
const mockMarkFailed = jest.fn();
const mockMarkDeadLetter = jest.fn();
const mockFindByEventId = jest.fn();

jest.mock('../inbox.repository', () => ({
  InboxRepository: jest.fn().mockImplementation(() => ({
    tryInsert: mockTryInsert,
    markProcessing: mockMarkProcessing,
    markProcessed: mockMarkProcessed,
    markFailed: mockMarkFailed,
    markDeadLetter: mockMarkDeadLetter,
    findByEventId: mockFindByEventId,
  })),
}));

const mockTransaction = jest.fn();
const mockDataSource = {
  getRepository: jest.fn(),
  transaction: mockTransaction,
} as any;

const mockSendToDlq = jest.fn();
const mockDlqProducer = {
  sendToDlq: mockSendToDlq,
} as any;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('InboxService', () => {
  let service: InboxService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InboxService(mockDataSource, mockDlqProducer, 'test-service');
  });

  describe('handleIncoming', () => {
    const baseOptions = {
      eventId: 'evt-1',
      eventType: 'order.created',
      aggregateId: 'ord-123',
      payload: { orderId: 'ord-123', totalAmount: 100 },
      topic: 'order.events',
      handler: jest.fn(),
    };

    it('should process a new event successfully', async () => {
      mockTryInsert.mockResolvedValue(true);
      mockMarkProcessing.mockResolvedValue(true);
      mockTransaction.mockImplementation(async (cb: any) => cb({}));
      baseOptions.handler.mockResolvedValue(undefined);

      await service.handleIncoming(baseOptions);

      expect(mockTryInsert).toHaveBeenCalled();
      expect(mockMarkProcessing).toHaveBeenCalled();
      expect(mockTransaction).toHaveBeenCalled();
      expect(baseOptions.handler).toHaveBeenCalledWith(
        baseOptions.payload,
        expect.objectContaining({
          eventId: 'evt-1',
          eventType: 'order.created',
          aggregateId: 'ord-123',
        }),
      );
      expect(mockMarkProcessed).toHaveBeenCalled();
    });

    it('should skip duplicate events that are already PROCESSED', async () => {
      mockTryInsert.mockResolvedValue(false); // duplicate
      mockFindByEventId.mockResolvedValue({
        eventId: 'evt-1',
        status: InboxEventStatus.PROCESSED,
      });

      await service.handleIncoming(baseOptions);

      expect(mockMarkProcessing).not.toHaveBeenCalled();
      expect(baseOptions.handler).not.toHaveBeenCalled();
    });

    it('should skip duplicate events in PROCESSING state', async () => {
      mockTryInsert.mockResolvedValue(false);
      mockFindByEventId.mockResolvedValue({
        eventId: 'evt-1',
        status: InboxEventStatus.PROCESSING,
      });

      await service.handleIncoming(baseOptions);

      expect(mockMarkProcessing).not.toHaveBeenCalled();
      expect(baseOptions.handler).not.toHaveBeenCalled();
    });

    it('should mark event as FAILED on handler error', async () => {
      mockTryInsert.mockResolvedValue(true);
      mockMarkProcessing.mockResolvedValue(true);
      mockTransaction.mockImplementation(async (cb: any) => {
        await cb({});
      });
      const handlerError = new Error('Processing failed');
      baseOptions.handler.mockRejectedValue(handlerError);
      mockFindByEventId.mockResolvedValue({
        eventId: 'evt-1',
        retryCount: 0,
        maxRetries: 5,
      });

      await service.handleIncoming(baseOptions);

      expect(mockMarkFailed).toHaveBeenCalled();
    });

    it('should move to DLQ when max retries exhausted', async () => {
      mockTryInsert.mockResolvedValue(true);
      mockMarkProcessing.mockResolvedValue(true);
      mockTransaction.mockImplementation(async (cb: any) => {
        await cb({});
      });
      const handlerError = new Error('Persistent failure');
      baseOptions.handler.mockRejectedValue(handlerError);
      mockFindByEventId.mockResolvedValue({
        eventId: 'evt-1',
        retryCount: 4, // will become 5 which equals maxRetries
        maxRetries: 5,
      });

      await service.handleIncoming(baseOptions);

      expect(mockMarkDeadLetter).toHaveBeenCalled();
      expect(mockSendToDlq).toHaveBeenCalledWith(
        'order.events',
        expect.objectContaining({ key: 'evt-1' }),
        handlerError,
        5,
      );
    });

    it('should not process if CAS lock fails', async () => {
      mockTryInsert.mockResolvedValue(true);
      mockMarkProcessing.mockResolvedValue(false); // another worker took it

      await service.handleIncoming(baseOptions);

      expect(baseOptions.handler).not.toHaveBeenCalled();
      expect(mockTransaction).not.toHaveBeenCalled();
    });
  });
});
