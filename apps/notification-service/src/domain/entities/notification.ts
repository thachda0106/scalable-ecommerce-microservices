import { NotificationChannel } from '../enums/notification-channel.enum';
import { NotificationStatus } from '../enums/notification-status.enum';
import { NotificationPriority } from '../enums/notification-priority.enum';
import { BaseDomainEvent } from '../events/base-domain.event';
import { NotificationSentEvent } from '../events/notification-sent.event';
import { NotificationFailedEvent } from '../events/notification-failed.event';
import { NotificationRetryScheduledEvent } from '../events/notification-retry-scheduled.event';

/** Maximum exponential backoff delay in milliseconds (30 seconds). */
const MAX_BACKOFF_MS = 30_000;

interface NotificationProps {
  id: string;
  recipientId: string;
  recipientEmail?: string;
  recipientPhone?: string;
  channel: NotificationChannel;
  templateSlug: string;
  subject: string;
  body: string;
  status: NotificationStatus;
  priority: NotificationPriority;
  attempt: number;
  maxRetries: number;
  metadata: Record<string, unknown>;
  errorMessage?: string;
  sentAt?: Date;
  nextRetryAt?: Date;
  correlationId: string;
  createdAt: Date;
  updatedAt: Date;
}

export class Notification {
  private readonly props: NotificationProps;
  private domainEvents: BaseDomainEvent[] = [];

  private constructor(props: NotificationProps) {
    this.props = props;
  }

  // ─── Factory Methods ────────────────────────────────────────────────────────

  public static create(props: {
    recipientId: string;
    channel: NotificationChannel;
    templateSlug: string;
    subject: string;
    body: string;
    correlationId: string;
    priority?: NotificationPriority;
    maxRetries?: number;
    metadata?: Record<string, unknown>;
    recipientEmail?: string;
    recipientPhone?: string;
  }): Notification {
    const now = new Date();
    return new Notification({
      id: crypto.randomUUID(),
      recipientId: props.recipientId,
      recipientEmail: props.recipientEmail,
      recipientPhone: props.recipientPhone,
      channel: props.channel,
      templateSlug: props.templateSlug,
      subject: props.subject,
      body: props.body,
      status: NotificationStatus.PENDING,
      priority: props.priority ?? NotificationPriority.NORMAL,
      attempt: 0,
      maxRetries: props.maxRetries ?? 3,
      metadata: props.metadata ?? {},
      correlationId: props.correlationId,
      createdAt: now,
      updatedAt: now,
    });
  }

  public static reconstitute(props: NotificationProps): Notification {
    return new Notification(props);
  }

  // ─── Getters ─────────────────────────────────────────────────────────────────

  get id(): string {
    return this.props.id;
  }
  get recipientId(): string {
    return this.props.recipientId;
  }
  get recipientEmail(): string | undefined {
    return this.props.recipientEmail;
  }
  get recipientPhone(): string | undefined {
    return this.props.recipientPhone;
  }
  get channel(): NotificationChannel {
    return this.props.channel;
  }
  get templateSlug(): string {
    return this.props.templateSlug;
  }
  get subject(): string {
    return this.props.subject;
  }
  get body(): string {
    return this.props.body;
  }
  get status(): NotificationStatus {
    return this.props.status;
  }
  get priority(): NotificationPriority {
    return this.props.priority;
  }
  get attempt(): number {
    return this.props.attempt;
  }
  get maxRetries(): number {
    return this.props.maxRetries;
  }
  get correlationId(): string {
    return this.props.correlationId;
  }

  // ─── Domain Behaviour ────────────────────────────────────────────────────────

  /**
   * Marks the notification as successfully sent.
   * Emits NotificationSentEvent.
   */
  public markSent(): void {
    const now = new Date();
    this.props.status = NotificationStatus.SENT;
    this.props.sentAt = now;
    this.props.updatedAt = now;

    this.domainEvents.push(
      new NotificationSentEvent(
        this.props.id,
        this.props.channel,
        this.props.recipientId,
        this.props.templateSlug,
        now,
      ),
    );
  }

  /**
   * Marks the notification as failed.
   * - If retries remain: sets status to RETRYING with exponential backoff.
   * - If max retries exhausted: sets status to FAILED.
   *
   * Exponential backoff: min(2^attempt * 1000ms, MAX_BACKOFF_MS)
   */
  public markFailed(reason: string): void {
    this.props.attempt += 1;
    this.props.updatedAt = new Date();

    if (this.props.attempt < this.props.maxRetries) {
      this.props.status = NotificationStatus.RETRYING;
      this.props.errorMessage = reason;

      const backoffMs = Math.min(
        Math.pow(2, this.props.attempt) * 1000,
        MAX_BACKOFF_MS,
      );
      this.props.nextRetryAt = new Date(Date.now() + backoffMs);

      this.domainEvents.push(
        new NotificationRetryScheduledEvent(
          this.props.id,
          this.props.channel,
          this.props.recipientId,
          this.props.attempt,
          this.props.nextRetryAt,
        ),
      );
    } else {
      this.props.status = NotificationStatus.FAILED;
      this.props.errorMessage = reason;
      this.props.nextRetryAt = undefined;

      this.domainEvents.push(
        new NotificationFailedEvent(
          this.props.id,
          this.props.channel,
          this.props.recipientId,
          reason,
          this.props.attempt,
          this.props.maxRetries,
        ),
      );
    }
  }

  /**
   * Moves the notification to the Dead Letter Queue.
   * Only valid when status is FAILED.
   */
  public markDlq(): void {
    if (this.props.status !== NotificationStatus.FAILED) {
      throw new Error(
        `Cannot move notification ${this.props.id} to DLQ: current status is ${this.props.status}, expected FAILED`,
      );
    }
    this.props.status = NotificationStatus.DLQ;
    this.props.updatedAt = new Date();
  }

  /**
   * Returns true if the notification can be retried.
   */
  public canRetry(): boolean {
    return (
      this.props.status === NotificationStatus.RETRYING &&
      this.props.attempt < this.props.maxRetries
    );
  }

  /**
   * Returns accumulated domain events and clears the internal buffer.
   */
  public pullEvents(): BaseDomainEvent[] {
    const events = [...this.domainEvents];
    this.domainEvents.length = 0;
    return events;
  }

  // ─── Serialisation ───────────────────────────────────────────────────────────

  public toJSON() {
    return {
      id: this.props.id,
      recipientId: this.props.recipientId,
      recipientEmail: this.props.recipientEmail,
      recipientPhone: this.props.recipientPhone,
      channel: this.props.channel,
      templateSlug: this.props.templateSlug,
      subject: this.props.subject,
      body: this.props.body,
      status: this.props.status,
      priority: this.props.priority,
      attempt: this.props.attempt,
      maxRetries: this.props.maxRetries,
      metadata: this.props.metadata,
      errorMessage: this.props.errorMessage,
      sentAt: this.props.sentAt?.toISOString(),
      nextRetryAt: this.props.nextRetryAt?.toISOString(),
      correlationId: this.props.correlationId,
      createdAt: this.props.createdAt.toISOString(),
      updatedAt: this.props.updatedAt.toISOString(),
    };
  }
}
