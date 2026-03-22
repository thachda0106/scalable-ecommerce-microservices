import { InboxRepository } from '../inbox.repository';
import { InboxEventEntity } from '../inbox-event.entity';
import { InboxEventStatus } from '../inbox.types';

// ─── Mocked TypeORM QueryBuilder & Repository ────────────────────────────────

const mockExecute = jest.fn();
const mockOrIgnore = jest.fn().mockReturnValue({ execute: mockExecute });
const mockValues = jest.fn().mockReturnValue({ orIgnore: mockOrIgnore });
const mockInto = jest.fn().mockReturnValue({ values: mockValues });
const mockInsert = jest.fn().mockReturnValue({ into: mockInto });
const mockWhere = jest.fn().mockReturnThis();
const mockAndWhere = jest.fn().mockReturnThis();
const mockOrderBy = jest.fn().mockReturnThis();
const mockTake = jest.fn().mockReturnThis();
const mockGetMany = jest.fn();

const mockQb = {
  insert: mockInsert,
  where: mockWhere,
  andWhere: mockAndWhere,
  orderBy: mockOrderBy,
  take: mockTake,
  getMany: mockGetMany,
};

const mockUpdate = jest.fn();
const mockFindOne = jest.fn();
const mockDelete = jest.fn();

const mockRepo = {
  createQueryBuilder: jest.fn().mockReturnValue(mockQb),
  update: mockUpdate,
  findOne: mockFindOne,
  delete: mockDelete,
};

const mockDataSource = {
  getRepository: jest.fn().mockReturnValue(mockRepo),
} as any;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('InboxRepository', () => {
  let repository: InboxRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new InboxRepository(mockDataSource);
  });

  describe('tryInsert', () => {
    it('should return true when event is inserted (new event)', async () => {
      mockExecute.mockResolvedValue({ raw: [{ id: 'uuid-1' }] });

      const event = new InboxEventEntity();
      event.id = 'uuid-1';
      event.eventId = 'evt-1';
      event.eventType = 'order.created';
      event.payload = { orderId: '123' };
      event.status = InboxEventStatus.RECEIVED;
      event.retryCount = 0;
      event.maxRetries = 5;

      const result = await repository.tryInsert(event);

      expect(result).toBe(true);
      expect(mockInsert).toHaveBeenCalled();
      expect(mockOrIgnore).toHaveBeenCalled();
    });

    it('should return false when event is a duplicate', async () => {
      mockExecute.mockResolvedValue({ raw: [] });

      const event = new InboxEventEntity();
      event.id = 'uuid-2';
      event.eventId = 'evt-1'; // same eventId
      event.eventType = 'order.created';
      event.payload = { orderId: '123' };
      event.status = InboxEventStatus.RECEIVED;
      event.retryCount = 0;
      event.maxRetries = 5;

      const result = await repository.tryInsert(event);

      expect(result).toBe(false);
    });
  });

  describe('markProcessing', () => {
    it('should return true when CAS succeeds (RECEIVED → PROCESSING)', async () => {
      mockUpdate.mockResolvedValue({ affected: 1 });

      const result = await repository.markProcessing('uuid-1');

      expect(result).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'uuid-1', status: InboxEventStatus.RECEIVED },
        { status: InboxEventStatus.PROCESSING },
      );
    });

    it('should return false when CAS fails (already processing)', async () => {
      mockUpdate.mockResolvedValue({ affected: 0 });

      const result = await repository.markProcessing('uuid-1');

      expect(result).toBe(false);
    });
  });

  describe('markRetryProcessing', () => {
    it('should CAS update FAILED → PROCESSING', async () => {
      mockUpdate.mockResolvedValue({ affected: 1 });

      const result = await repository.markRetryProcessing('uuid-1');

      expect(result).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'uuid-1', status: InboxEventStatus.FAILED },
        { status: InboxEventStatus.PROCESSING },
      );
    });
  });

  describe('markProcessed', () => {
    it('should set PROCESSED status and processedAt timestamp', async () => {
      mockUpdate.mockResolvedValue({ affected: 1 });

      await repository.markProcessed('uuid-1');

      expect(mockUpdate).toHaveBeenCalledWith('uuid-1', {
        status: InboxEventStatus.PROCESSED,
        processedAt: expect.any(Date),
      });
    });
  });

  describe('markFailed', () => {
    it('should set FAILED status with exponential backoff nextRetryAt', async () => {
      mockUpdate.mockResolvedValue({ affected: 1 });

      await repository.markFailed('uuid-1', 'DB connection error', 2, 1000);

      expect(mockUpdate).toHaveBeenCalledWith('uuid-1', {
        status: InboxEventStatus.FAILED,
        errorMessage: 'DB connection error',
        retryCount: 2,
        nextRetryAt: expect.any(Date),
      });

      // Verify exponential backoff: 1000 * 2^2 = 4000ms
      const call = mockUpdate.mock.calls[0][1];
      const nextRetry = call.nextRetryAt.getTime();
      const now = Date.now();
      expect(nextRetry).toBeGreaterThanOrEqual(now + 3500); // ~4000ms with tolerance
      expect(nextRetry).toBeLessThanOrEqual(now + 5000);
    });
  });

  describe('markDeadLetter', () => {
    it('should set DEAD_LETTER status', async () => {
      mockUpdate.mockResolvedValue({ affected: 1 });

      await repository.markDeadLetter('uuid-1', 'Max retries exhausted');

      expect(mockUpdate).toHaveBeenCalledWith('uuid-1', {
        status: InboxEventStatus.DEAD_LETTER,
        errorMessage: 'Max retries exhausted',
      });
    });
  });

  describe('findRetryable', () => {
    it('should query for FAILED events with expired backoff', async () => {
      const mockEvent = new InboxEventEntity();
      mockEvent.id = 'uuid-1';
      mockEvent.status = InboxEventStatus.FAILED;
      mockGetMany.mockResolvedValue([mockEvent]);

      const result = await repository.findRetryable(50);

      expect(result).toEqual([mockEvent]);
      expect(mockRepo.createQueryBuilder).toHaveBeenCalledWith('inbox');
      expect(mockWhere).toHaveBeenCalledWith('inbox.status = :status', {
        status: InboxEventStatus.FAILED,
      });
      expect(mockTake).toHaveBeenCalledWith(50);
    });
  });

  describe('findByEventId', () => {
    it('should find an event by its unique eventId', async () => {
      const mockEvent = new InboxEventEntity();
      mockEvent.eventId = 'evt-1';
      mockFindOne.mockResolvedValue(mockEvent);

      const result = await repository.findByEventId('evt-1');

      expect(result).toBe(mockEvent);
      expect(mockFindOne).toHaveBeenCalledWith({
        where: { eventId: 'evt-1' },
      });
    });

    it('should return null when event does not exist', async () => {
      mockFindOne.mockResolvedValue(null);

      const result = await repository.findByEventId('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('deleteProcessedBefore', () => {
    it('should delete PROCESSED and DEAD_LETTER events before cutoff', async () => {
      mockDelete.mockResolvedValue({ affected: 42 });

      const cutoff = new Date('2025-01-01');
      const result = await repository.deleteProcessedBefore(cutoff);

      expect(result).toBe(42);
      expect(mockDelete).toHaveBeenCalled();
    });
  });
});
