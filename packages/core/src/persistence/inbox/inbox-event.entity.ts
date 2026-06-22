import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { InboxEventStatus } from './inbox.types';

/**
 * Shared inbox event entity for the Transactional Inbox pattern.
 *
 * Each consumer service registers this entity in its TypeORM config.
 * The InboxService uses the UNIQUE constraint on `eventId` for deduplication:
 *
 * ```sql
 * INSERT INTO inbox_events (...) VALUES (...)
 * ON CONFLICT (event_id) DO NOTHING;
 * ```
 *
 * Status lifecycle: RECEIVED → PROCESSING → PROCESSED
 *                                         → FAILED → (retry) → PROCESSING
 *                                         → FAILED → DEAD_LETTER
 */
@Entity('inbox_events')
@Index('idx_inbox_status_created', ['status', 'createdAt'])
@Index('idx_inbox_event_type', ['eventType'])
@Index('idx_inbox_aggregate_id', ['aggregateId'])
@Index('idx_inbox_correlation_id', ['correlationId'])
export class InboxEventEntity {
  @PrimaryColumn('uuid')
  id!: string;

  /** Unique event identifier from the producer — used for deduplication */
  @Column({ type: 'varchar', length: 255, unique: true })
  eventId!: string;

  @Column({ type: 'varchar', length: 100 })
  eventType!: string;

  /** Original Kafka topic (for DLQ routing on retry) */
  @Column({ type: 'varchar', length: 255, nullable: true })
  topic?: string;

  /** Aggregate ID for ordering and querying (e.g. orderId, userId) */
  @Column({ type: 'varchar', length: 255, nullable: true })
  aggregateId?: string;

  /** Source service that produced the event */
  @Column({ type: 'varchar', length: 100, nullable: true })
  source?: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({
    type: 'varchar',
    length: 20,
    default: InboxEventStatus.RECEIVED,
  })
  status!: InboxEventStatus;

  @Column({ type: 'int', default: 0 })
  retryCount!: number;

  @Column({ type: 'int', default: 5 })
  maxRetries!: number;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  /** Correlation ID propagated from Kafka headers for distributed tracing */
  @Column({ type: 'varchar', length: 255, nullable: true })
  correlationId?: string;

  /**
   * Earliest time the processor should retry this event.
   * Calculated with exponential backoff: backoffMs * 2^retryCount
   */
  @Column({ type: 'timestamptz', nullable: true })
  nextRetryAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  processedAt?: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
