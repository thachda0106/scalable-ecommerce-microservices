export enum NotificationStatus {
  /** Initial state — notification created, not yet sent */
  PENDING = 'PENDING',
  /** Successfully delivered via channel provider */
  SENT = 'SENT',
  /** Delivery failed, all retries exhausted */
  FAILED = 'FAILED',
  /** Delivery failed, retry scheduled */
  RETRYING = 'RETRYING',
  /** Moved to Dead Letter Queue after max retries */
  DLQ = 'DLQ',
}
