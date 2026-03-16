---
phase: 12
plan: 1
wave: 1
depends_on: []
files_modified:
  - apps/notification-service/src/domain/entities/notification.ts
  - apps/notification-service/src/domain/entities/notification-template.ts
  - apps/notification-service/src/domain/enums/notification-channel.enum.ts
  - apps/notification-service/src/domain/enums/notification-status.enum.ts
  - apps/notification-service/src/domain/enums/notification-priority.enum.ts
  - apps/notification-service/src/domain/events/base-domain.event.ts
  - apps/notification-service/src/domain/events/notification-sent.event.ts
  - apps/notification-service/src/domain/events/notification-failed.event.ts
  - apps/notification-service/src/domain/events/notification-retry-scheduled.event.ts
  - apps/notification-service/src/domain/errors/notification-delivery-failed.error.ts
  - apps/notification-service/src/domain/errors/template-not-found.error.ts
  - apps/notification-service/src/domain/errors/invalid-channel.error.ts
  - apps/notification-service/src/domain/ports/notification-repository.port.ts
  - apps/notification-service/src/domain/ports/template-repository.port.ts
  - apps/notification-service/src/domain/ports/channel-provider.port.ts
  - apps/notification-service/src/domain/ports/event-publisher.port.ts
autonomous: true
user_setup: []

must_haves:
  truths:
    - "Notification entity tracks full lifecycle: PENDING → SENT | FAILED | RETRYING"
    - "NotificationTemplate supports variable interpolation with {{variableName}} syntax"
    - "NotificationChannel enum has exactly 4 values: EMAIL, SMS, PUSH, IN_APP"
    - "Domain layer has zero NestJS or infrastructure imports"
    - "All entities produce domain events via pullEvents()"
    - "Port interfaces use Symbol injection tokens — no concrete implementations"
  artifacts:
    - "apps/notification-service/src/domain/entities/notification.ts exists"
    - "apps/notification-service/src/domain/entities/notification-template.ts exists"
    - "apps/notification-service/src/domain/enums/notification-channel.enum.ts exists"
    - "apps/notification-service/src/domain/ports/channel-provider.port.ts exists"
---

# Plan 12.1: Domain Layer — Entities, Enums, Events, Errors & Ports

<objective>
Build the pure domain layer for the notification-service with zero infrastructure dependencies.
This is the foundation all other plans depend on.

Purpose: Establish the Notification aggregate (with lifecycle state machine), NotificationTemplate entity (with variable interpolation), channel/status/priority enums, domain events, domain errors, and port interfaces for repositories and providers.
Output: 16 TypeScript files in src/domain/
</objective>

<context>
Load for context:
- apps/notification-service/src/notification/notification.service.ts  (current naive service — being replaced)
- apps/cart-service/src/domain/entities/cart.entity.ts  (reference pattern for aggregate root with private constructor + create/reconstitute)
- apps/cart-service/src/domain/events/base-domain.event.ts  (reference pattern for domain events)
- apps/cart-service/src/domain/repositories/cart-repository.interface.ts  (reference pattern for port interfaces)
- apps/inventory-service/src/domain/entities/product-inventory.ts  (reference for aggregate with pullEvents())
</context>

<tasks>

<task type="auto">
  <name>Create enums (NotificationChannel, NotificationStatus, NotificationPriority)</name>
  <files>
    apps/notification-service/src/domain/enums/notification-channel.enum.ts
    apps/notification-service/src/domain/enums/notification-status.enum.ts
    apps/notification-service/src/domain/enums/notification-priority.enum.ts
  </files>
  <action>
    **notification-channel.enum.ts**:
    ```ts
    export enum NotificationChannel {
      EMAIL = 'EMAIL',
      SMS = 'SMS',
      PUSH = 'PUSH',
      IN_APP = 'IN_APP',
    }
    ```

    **notification-status.enum.ts**:
    ```ts
    export enum NotificationStatus {
      PENDING = 'PENDING',
      SENT = 'SENT',
      FAILED = 'FAILED',
      RETRYING = 'RETRYING',
      DLQ = 'DLQ',
    }
    ```
    State machine transitions:
    - PENDING → SENT (delivery succeeded)
    - PENDING → FAILED (delivery failed, no retries left)
    - PENDING → RETRYING (delivery failed, retries remaining)
    - RETRYING → SENT (retry succeeded)
    - RETRYING → FAILED (retry failed, no retries left)
    - FAILED → DLQ (moved to dead letter queue)

    **notification-priority.enum.ts**:
    ```ts
    export enum NotificationPriority {
      LOW = 'LOW',
      NORMAL = 'NORMAL',
      HIGH = 'HIGH',
      CRITICAL = 'CRITICAL',
    }
    ```

    AVOID NestJS imports. Pure TypeScript enums only.
  </action>
  <verify>npx tsc --noEmit 2>&1 | grep -E "enums" || echo "Enums compile OK"</verify>
  <done>3 enum files exist. NotificationChannel has 4 values. NotificationStatus has 5 values with documented state machine. NotificationPriority has 4 levels. Zero NestJS imports.</done>
</task>

<task type="auto">
  <name>Create domain errors, base event, and domain events</name>
  <files>
    apps/notification-service/src/domain/errors/notification-delivery-failed.error.ts
    apps/notification-service/src/domain/errors/template-not-found.error.ts
    apps/notification-service/src/domain/errors/invalid-channel.error.ts
    apps/notification-service/src/domain/events/base-domain.event.ts
    apps/notification-service/src/domain/events/notification-sent.event.ts
    apps/notification-service/src/domain/events/notification-failed.event.ts
    apps/notification-service/src/domain/events/notification-retry-scheduled.event.ts
  </files>
  <action>
    **notification-delivery-failed.error.ts**:
    ```ts
    export class NotificationDeliveryFailedError extends Error {
      constructor(
        public readonly notificationId: string,
        public readonly channel: string,
        public readonly reason: string,
        public readonly attempt: number,
      ) {
        super(`Notification ${notificationId} delivery failed via ${channel} on attempt ${attempt}: ${reason}`);
        this.name = 'NotificationDeliveryFailedError';
      }
    }
    ```

    **template-not-found.error.ts**:
    ```ts
    export class TemplateNotFoundError extends Error {
      constructor(public readonly templateSlug: string) {
        super(`Notification template not found: ${templateSlug}`);
        this.name = 'TemplateNotFoundError';
      }
    }
    ```

    **invalid-channel.error.ts**:
    ```ts
    export class InvalidChannelError extends Error {
      constructor(public readonly channel: string) {
        super(`Invalid notification channel: ${channel}`);
        this.name = 'InvalidChannelError';
      }
    }
    ```

    **base-domain.event.ts** — match the pattern from cart-service and inventory-service:
    ```ts
    export abstract class BaseDomainEvent {
      public readonly eventId: string = crypto.randomUUID();
      public readonly occurredOn: Date = new Date();
      public abstract readonly eventType: string;
    }
    ```

    **notification-sent.event.ts**:
    - eventType = 'notification.sent'
    - Fields: notificationId, channel, recipientId, templateSlug, sentAt

    **notification-failed.event.ts**:
    - eventType = 'notification.failed'
    - Fields: notificationId, channel, recipientId, reason, attempt, maxRetries

    **notification-retry-scheduled.event.ts**:
    - eventType = 'notification.retry_scheduled'
    - Fields: notificationId, channel, recipientId, attempt, nextRetryAt

    Each event extends BaseDomainEvent. Accept all fields via constructor parameters.
    AVOID NestJS imports. Pure TypeScript only.
  </action>
  <verify>npx tsc --noEmit 2>&1 | grep -E "errors|events" || echo "Errors and events compile OK"</verify>
  <done>3 error files and 4 event files (including base) exist. Each error includes relevant context fields. Each event has unique eventType string. All code is framework-free.</done>
</task>

<task type="auto">
  <name>Create Notification aggregate and NotificationTemplate entity</name>
  <files>
    apps/notification-service/src/domain/entities/notification.ts
    apps/notification-service/src/domain/entities/notification-template.ts
  </files>
  <action>
    **notification.ts** — THE aggregate root:
    - Class `Notification` with private constructor
    - Properties stored in private `props` object (following cart-service pattern):
      - `id: string`, `recipientId: string`, `recipientEmail?: string`, `recipientPhone?: string`
      - `channel: NotificationChannel`, `templateSlug: string`
      - `subject: string`, `body: string` (rendered content after template interpolation)
      - `status: NotificationStatus` (PENDING initially)
      - `priority: NotificationPriority` (NORMAL default)
      - `attempt: number` (starts at 0), `maxRetries: number` (default 3)
      - `metadata: Record<string, unknown>` (arbitrary context like orderId, userId)
      - `errorMessage?: string`, `sentAt?: Date`, `nextRetryAt?: Date`
      - `correlationId: string` (for tracing, links back to triggering event)
      - `createdAt: Date`, `updatedAt: Date`
    - Private `domainEvents: BaseDomainEvent[] = []`

    - Static `create(props: { recipientId, channel, templateSlug, subject, body, priority?, maxRetries?, metadata?, correlationId, recipientEmail?, recipientPhone? }): Notification`:
      - Generates UUID via `crypto.randomUUID()`
      - Sets status = PENDING, attempt = 0, createdAt = now

    - Static `reconstitute(props: all fields): Notification` — for loading from DB

    - Method `markSent(): void`:
      - Sets status = SENT, sentAt = now, updatedAt = now
      - Push `NotificationSentEvent`

    - Method `markFailed(reason: string): void`:
      - Increments attempt
      - If attempt < maxRetries: status = RETRYING, calculates nextRetryAt with exponential backoff (base 2^attempt * 1000ms, max 30s), push `NotificationRetryScheduledEvent`
      - If attempt >= maxRetries: status = FAILED, errorMessage = reason, push `NotificationFailedEvent`
      - updatedAt = now

    - Method `markDlq(): void`:
      - Sets status = DLQ, updatedAt = now
      - Only valid if current status is FAILED

    - Method `canRetry(): boolean`:
      - Returns true if status is RETRYING and attempt < maxRetries

    - Method `pullEvents(): BaseDomainEvent[]` — returns copy and clears array (same as cart-service)
    - Method `toJSON()` — all fields as plain object

    CRITICAL: The `markFailed()` method implements the retry decision logic — exponential backoff is calculated here in the domain, not in infrastructure.

    **notification-template.ts**:
    - Class `NotificationTemplate` with private constructor
    - Properties:
      - `slug: string` (unique identifier, e.g., 'order-confirmation-email')
      - `name: string` (human-readable name)
      - `channel: NotificationChannel`
      - `subjectTemplate: string` (e.g., 'Order {{orderId}} Confirmed')
      - `bodyTemplate: string` (e.g., 'Hi {{userName}}, your order...')
      - `requiredVariables: string[]` (e.g., ['userName', 'orderId'])
      - `isActive: boolean`
      - `createdAt: Date`, `updatedAt: Date`

    - Static `create(props): NotificationTemplate`
    - Static `reconstitute(props): NotificationTemplate`

    - Method `render(variables: Record<string, string>): { subject: string; body: string }`:
      - Validates all requiredVariables are present in variables map — throws Error if missing
      - Replaces all `{{variableName}}` occurrences in subjectTemplate and bodyTemplate
      - Returns rendered subject and body

    - Method `toJSON()` — all fields as plain object

    AVOID NestJS imports. Use `{{variableName}}` regex: `/\{\{(\w+)\}\}/g`
  </action>
  <verify>npx tsc --noEmit 2>&1 | grep -E "entities" || echo "Entities compile OK"</verify>
  <done>Notification aggregate has create/reconstitute factories, markSent/markFailed/markDlq lifecycle methods with status state machine. markFailed implements exponential backoff retry scheduling. NotificationTemplate.render() interpolates {{variables}} and validates required variables. Both use private constructor pattern. Zero NestJS imports.</done>
</task>

<task type="auto">
  <name>Create port interfaces (repositories, channel provider, event publisher)</name>
  <files>
    apps/notification-service/src/domain/ports/notification-repository.port.ts
    apps/notification-service/src/domain/ports/template-repository.port.ts
    apps/notification-service/src/domain/ports/channel-provider.port.ts
    apps/notification-service/src/domain/ports/event-publisher.port.ts
  </files>
  <action>
    **notification-repository.port.ts**:
    ```ts
    import { Notification } from '../entities/notification';

    export const NOTIFICATION_REPOSITORY = Symbol('NOTIFICATION_REPOSITORY');

    export interface INotificationRepository {
      save(notification: Notification): Promise<void>;
      findById(id: string): Promise<Notification | null>;
      findByCorrelationId(correlationId: string): Promise<Notification[]>;
      findPendingRetries(limit: number): Promise<Notification[]>;
      findFailedForDlq(limit: number): Promise<Notification[]>;
    }
    ```

    **template-repository.port.ts**:
    ```ts
    import { NotificationTemplate } from '../entities/notification-template';

    export const TEMPLATE_REPOSITORY = Symbol('TEMPLATE_REPOSITORY');

    export interface ITemplateRepository {
      findBySlug(slug: string): Promise<NotificationTemplate | null>;
      findAll(): Promise<NotificationTemplate[]>;
      save(template: NotificationTemplate): Promise<void>;
    }
    ```

    **channel-provider.port.ts** — adapter interface for email/sms/push providers:
    ```ts
    import { NotificationChannel } from '../enums/notification-channel.enum';

    export const CHANNEL_PROVIDER_FACTORY = Symbol('CHANNEL_PROVIDER_FACTORY');

    export interface IChannelProvider {
      readonly channel: NotificationChannel;
      send(payload: ChannelPayload): Promise<ChannelResult>;
    }

    export interface ChannelPayload {
      recipientId: string;
      recipientEmail?: string;
      recipientPhone?: string;
      recipientDeviceToken?: string;
      subject: string;
      body: string;
      metadata?: Record<string, unknown>;
    }

    export interface ChannelResult {
      success: boolean;
      providerMessageId?: string;
      errorMessage?: string;
    }

    export interface IChannelProviderFactory {
      getProvider(channel: NotificationChannel): IChannelProvider;
    }
    ```

    **event-publisher.port.ts**:
    ```ts
    import { BaseDomainEvent } from '../events/base-domain.event';

    export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');

    export interface IEventPublisher {
      publish(event: BaseDomainEvent): Promise<void>;
      publishBatch(events: BaseDomainEvent[]): Promise<void>;
    }
    ```

    AVOID making ports concrete classes. They are interfaces with Symbol tokens only.
    AVOID NestJS decorators in port files.
    NOTE: IChannelProviderFactory is the key abstraction — it's a factory that returns the right provider for each channel. This decouples use cases from knowing about SendGrid/Twilio/Firebase directly.
  </action>
  <verify>npx tsc --noEmit 2>&1 | grep -E "ports" || echo "Ports compile OK"</verify>
  <done>4 port files exist. INotificationRepository supports save, findById, findPendingRetries, findFailedForDlq. ITemplateRepository supports findBySlug. IChannelProviderFactory abstracts multi-channel dispatch. IEventPublisher supports batch publishing. Each exports a Symbol token and interface. No concrete implementations.</done>
</task>

</tasks>

<verification>
After all tasks:
- [ ] `npx tsc --noEmit` from notification-service root shows zero errors for domain files
- [ ] No `@nestjs` import appears in any file under `src/domain/`
- [ ] Notification.markFailed() with attempt < maxRetries sets status to RETRYING
- [ ] Notification.markFailed() with attempt >= maxRetries sets status to FAILED
- [ ] NotificationTemplate.render() replaces all {{variable}} placeholders
- [ ] NotificationTemplate.render() throws if a required variable is missing
- [ ] 4 port interfaces defined with Symbol injection tokens
</verification>

<success_criteria>
- [ ] 16 domain files created (2 entities, 3 enums, 4 events, 3 errors, 4 ports)
- [ ] Domain layer is infrastructure-free (grep confirms no `@nestjs` import)
- [ ] TypeScript compiles without errors in domain/
- [ ] Notification lifecycle state machine enforced in domain methods
- [ ] Template variable interpolation works via regex
</success_criteria>
