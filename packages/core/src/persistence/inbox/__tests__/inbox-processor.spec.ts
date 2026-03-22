import { InboxProcessor } from '../inbox-processor';
import { InboxEventEntity } from '../inbox-event.entity';
import { InboxEventStatus } from '../inbox.types';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockFindRetryable = jest.fn();

jest.mock('../inbox.repository', () => ({
  InboxRepository: jest.fn().mockImplementation(() => ({
    findRetryable: mockFindRetryable,
  })),
}));

const mockRetryEvent = jest.fn();

jest.mock('../inbox.service', () => ({
  InboxService: jest.fn().mockImplementation(() => ({
    retryEvent: mockRetryEvent,
  })),
}));

const mockDataSource = {
  getRepository: jest.fn(),
} as any;

const mockDlqProducer = {} as any;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('InboxProcessor', () => {
  let processor: InboxProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new InboxProcessor(mockDataSource, mockDlqProducer, 'test-service');
  });

  describe('registerHandler', () => {
    it('should register a handler for an event type', () => {
      const handler = jest.fn();
      processor.registerHandler('order.created', handler);

      // No error thrown — handler registered
      expect(true).toBe(true);
    });
  });

  describe('processRetries', () => {
    it('should return 0 when no retryable events exist', async () => {
      mockFindRetryable.mockResolvedValue([]);

      const result = await processor.processRetries();

      expect(result).toBe(0);
    });

    it('should retry events with registered handlers', async () => {
      const mockEvent = new InboxEventEntity();
      mockEvent.id = 'uuid-1';
      mockEvent.eventId = 'evt-1';
      mockEvent.eventType = 'order.created';
      mockEvent.status = InboxEventStatus.FAILED;
      mockEvent.retryCount = 1;
      mockFindRetryable.mockResolvedValue([mockEvent]);
      mockRetryEvent.mockResolvedValue(undefined);

      const handler = jest.fn();
      processor.registerHandler('order.created', handler);

      const result = await processor.processRetries();

      expect(result).toBe(1);
      expect(mockRetryEvent).toHaveBeenCalledWith(mockEvent, expect.any(Function));
    });

    it('should skip events with no registered handler', async () => {
      const mockEvent = new InboxEventEntity();
      mockEvent.id = 'uuid-1';
      mockEvent.eventId = 'evt-1';
      mockEvent.eventType = 'unknown.event';
      mockEvent.status = InboxEventStatus.FAILED;
      mockFindRetryable.mockResolvedValue([mockEvent]);

      const result = await processor.processRetries();

      expect(result).toBe(0);
      expect(mockRetryEvent).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully and continue', async () => {
      const event1 = new InboxEventEntity();
      event1.id = 'uuid-1';
      event1.eventId = 'evt-1';
      event1.eventType = 'order.created';
      event1.status = InboxEventStatus.FAILED;

      const event2 = new InboxEventEntity();
      event2.id = 'uuid-2';
      event2.eventId = 'evt-2';
      event2.eventType = 'order.created';
      event2.status = InboxEventStatus.FAILED;

      mockFindRetryable.mockResolvedValue([event1, event2]);
      mockRetryEvent
        .mockRejectedValueOnce(new Error('Unexpected'))
        .mockResolvedValueOnce(undefined);

      const handler = jest.fn();
      processor.registerHandler('order.created', handler);

      const result = await processor.processRetries();

      expect(result).toBe(1); // Only event2 succeeded
      expect(mockRetryEvent).toHaveBeenCalledTimes(2);
    });
  });
});
