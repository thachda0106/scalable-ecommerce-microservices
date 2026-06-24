import { getLogger } from '../../observability';
import { DataSource, Repository, LessThanOrEqual, In } from 'typeorm';
import { InboxEventEntity } from './inbox-event.entity';
import { InboxEventStatus } from './inbox.types';

/**
 * Data-access layer for inbox events.
 *
 * Encapsulates all SQL/TypeORM operations so that InboxService and InboxProcessor
 * remain focused on orchestration logic.
 */
export class InboxRepository {
  private readonly logger = getLogger('InboxRepository');
  private readonly repo: Repository<InboxEventEntity>;

  constructor(private readonly dataSource: DataSource) {
    this.repo = dataSource.getRepository(InboxEventEntity);
  }

  // ─── Deduplication ───────────────────────────────────────────────────────

  /**
   * Attempts to insert a new inbox event.
   * Uses PostgreSQL ON CONFLICT DO NOTHING for atomic deduplication.
   *
   * @returns `true` if the event was inserted (new), `false` if duplicate.
   */
  async tryInsert(event: InboxEventEntity): Promise<boolean> {
    const result = await this.repo
      .createQueryBuilder()
      .insert()
      .into(InboxEventEntity)
      .values({
        id: event.id,
        eventId: event.eventId,
        eventType: event.eventType,
        aggregateId: event.aggregateId,
        source: event.source,
        topic: event.topic,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        payload: event.payload as any,
        status: event.status,
        retryCount: event.retryCount,
        maxRetries: event.maxRetries,
        correlationId: event.correlationId,
      })
      .orIgnore() // ON CONFLICT DO NOTHING
      .execute();

    // If affectedRows is 0, the UNIQUE constraint on eventId blocked the insert
    const inserted = (result.raw?.length ?? 0) > 0;

    if (!inserted) {
      this.logger.debug(`Duplicate inbox event skipped: eventId=${event.eventId}`);
    }

    return inserted;
  }

  // ─── Status Transitions ─────────────────────────────────────────────────

  /**
   * CAS (compare-and-swap) update: RECEIVED → PROCESSING.
   * Returns `true` if the transition succeeded, `false` if the event was
   * already picked up by another worker.
   */
  async markProcessing(id: string): Promise<boolean> {
    const result = await this.repo.update(
      { id, status: InboxEventStatus.RECEIVED },
      { status: InboxEventStatus.PROCESSING },
    );
    return (result.affected ?? 0) > 0;
  }

  /**
   * CAS update: FAILED → PROCESSING (for retries).
   */
  async markRetryProcessing(id: string): Promise<boolean> {
    const result = await this.repo.update(
      { id, status: InboxEventStatus.FAILED },
      { status: InboxEventStatus.PROCESSING },
    );
    return (result.affected ?? 0) > 0;
  }

  /**
   * Mark event as successfully processed.
   */
  async markProcessed(id: string): Promise<void> {
    await this.repo.update(id, {
      status: InboxEventStatus.PROCESSED,
      processedAt: new Date(),
    });
  }

  /**
   * Mark event as failed with error details and schedule next retry.
   *
   * @param backoffMs - Base backoff in milliseconds for exponential delay.
   */
  async markFailed(
    id: string,
    error: string,
    retryCount: number,
    backoffMs: number,
  ): Promise<void> {
    const delay = backoffMs * Math.pow(2, retryCount);
    const nextRetryAt = new Date(Date.now() + delay);

    await this.repo.update(id, {
      status: InboxEventStatus.FAILED,
      errorMessage: error,
      retryCount,
      nextRetryAt,
    });
  }

  /**
   * Mark event as dead-lettered (exhausted all retries).
   */
  async markDeadLetter(id: string, error: string): Promise<void> {
    await this.repo.update(id, {
      status: InboxEventStatus.DEAD_LETTER,
      errorMessage: error,
    });
  }

  // ─── Queries ─────────────────────────────────────────────────────────────

  /**
   * Find events eligible for retry:
   * - Status is FAILED
   * - retryCount < maxRetries
   * - nextRetryAt has passed (backoff expired)
   */
  async findRetryable(batchSize: number): Promise<InboxEventEntity[]> {
    return this.repo
      .createQueryBuilder('inbox')
      .where('inbox.status = :status', { status: InboxEventStatus.FAILED })
      .andWhere('inbox.retryCount < inbox.maxRetries')
      .andWhere('(inbox.nextRetryAt IS NULL OR inbox.nextRetryAt <= :now)', {
        now: new Date(),
      })
      .orderBy('inbox.createdAt', 'ASC')
      .take(batchSize)
      .getMany();
  }

  /**
   * Lookup by unique event ID (for dedup check and status inspection).
   */
  async findByEventId(eventId: string): Promise<InboxEventEntity | null> {
    return this.repo.findOne({ where: { eventId } });
  }

  /**
   * Delete processed events older than the given date (retention cleanup).
   *
   * @returns Number of deleted rows.
   */
  async deleteProcessedBefore(before: Date): Promise<number> {
    const result = await this.repo.delete({
      status: In([InboxEventStatus.PROCESSED, InboxEventStatus.DEAD_LETTER]),
      processedAt: LessThanOrEqual(before),
    });
    return result.affected ?? 0;
  }
}
