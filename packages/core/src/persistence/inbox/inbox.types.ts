/**
 * Inbox Pattern — shared types, enums, and interfaces.
 *
 * Used by InboxService, InboxRepository, InboxProcessor, and BaseEventConsumer.
 */

// ─── Status Lifecycle ────────────────────────────────────────────────────────

export enum InboxEventStatus {
  /** Event received from Kafka, not yet processed */
  RECEIVED = 'RECEIVED',
  /** Event is currently being processed within a transaction */
  PROCESSING = 'PROCESSING',
  /** Event was processed successfully */
  PROCESSED = 'PROCESSED',
  /** Event processing failed (will be retried) */
  FAILED = 'FAILED',
  /** Event exhausted all retries, sent to DLQ */
  DEAD_LETTER = 'DEAD_LETTER',
}

// ─── Handler Types ───────────────────────────────────────────────────────────

/**
 * Metadata passed to inbox event handlers alongside the payload.
 */
export interface InboxEventMetadata {
  readonly eventId: string;
  readonly eventType: string;
  readonly aggregateId?: string;
  readonly correlationId?: string;
  readonly source?: string;
  readonly receivedAt: Date;
}

/**
 * Function signature for inbox event handlers.
 *
 * @param payload - The deserialized event payload (JSONB from inbox table).
 * @param metadata - Event metadata (eventId, correlationId, etc.).
 */
export type InboxHandlerFn = (
  payload: Record<string, unknown>,
  metadata: InboxEventMetadata,
) => Promise<void>;

// ─── Configuration ───────────────────────────────────────────────────────────

export interface InboxConfig {
  /** Maximum number of retry attempts before moving to DLQ. Default: 5 */
  maxRetries?: number;
  /** Base backoff in ms for retry delay calculation. Default: 1000 */
  retryBackoffMs?: number;
  /** Batch size for the background retry processor. Default: 50 */
  processorBatchSize?: number;
  /** Retention period in days for processed events. Default: 30 */
  retentionDays?: number;
}

export const DEFAULT_INBOX_CONFIG: Required<InboxConfig> = {
  maxRetries: 5,
  retryBackoffMs: 1000,
  processorBatchSize: 50,
  retentionDays: 30,
};
