export { UnitOfWork } from './unit-of-work';
export type { IDomainEvent } from './unit-of-work';

// Outbox Pattern
export { OutboxEventEntity } from './outbox/outbox-event.entity';
export { OutboxProcessor } from './outbox/outbox-processor';

// Inbox Pattern
export { InboxEventEntity } from './inbox/inbox-event.entity';
export { InboxRepository } from './inbox/inbox.repository';
export { InboxService } from './inbox/inbox.service';
export { InboxProcessor } from './inbox/inbox-processor';
export { InboxCleanupService } from './inbox/inbox-cleanup.service';
export { BaseEventConsumer } from './inbox/base-event-consumer';
export {
  InboxEventStatus,
  DEFAULT_INBOX_CONFIG,
} from './inbox/inbox.types';
export type {
  InboxHandlerFn,
  InboxEventMetadata,
  InboxConfig,
} from './inbox/inbox.types';
