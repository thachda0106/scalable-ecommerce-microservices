---
phase: 12
plan: 2
wave: 1
depends_on: [1]
files_modified:
  - apps/notification-service/src/application/commands/send-notification.command.ts
  - apps/notification-service/src/application/commands/retry-notification.command.ts
  - apps/notification-service/src/application/commands/move-to-dlq.command.ts
  - apps/notification-service/src/application/queries/get-notification.query.ts
  - apps/notification-service/src/application/handlers/send-notification.handler.ts
  - apps/notification-service/src/application/handlers/retry-notification.handler.ts
  - apps/notification-service/src/application/handlers/move-to-dlq.handler.ts
  - apps/notification-service/src/application/handlers/get-notification.handler.ts
  - apps/notification-service/src/application/services/notification-orchestrator.service.ts
autonomous: true
user_setup: []

must_haves:
  truths:
    - "SendNotificationHandler resolves template, renders variables, dispatches to the correct channel provider, and persists the notification"
    - "RetryNotificationHandler processes only RETRYING notifications and delegates to the same channel provider"
    - "NotificationOrchestrator maps incoming event types to the appropriate template + channel + recipient"
    - "Handlers depend only on port interfaces via @Inject, not concrete implementations"
    - "All handlers publish domain events after save"
  artifacts:
    - "apps/notification-service/src/application/handlers/send-notification.handler.ts exists"
    - "apps/notification-service/src/application/services/notification-orchestrator.service.ts exists"
---

# Plan 12.2: Application Layer — Commands, Queries, Handlers & Orchestrator

<objective>
Implement the CQRS application layer: commands, queries, handlers, and the NotificationOrchestrator service.
Handlers contain all orchestration logic (template resolution, variable rendering, provider dispatch, persistence, event publishing).
The NotificationOrchestrator is the central mapping service that translates external domain events (order.paid, user.registered) into notification commands.

Purpose: Kafka consumers (Plan 12.3) will call the orchestrator. The orchestrator creates the right command. CommandBus dispatches to handlers. Handlers do the work.
Output: 3 commands, 1 query, 4 handlers, 1 orchestrator service.
</objective>

<context>
Load for context:
- apps/notification-service/src/domain/entities/notification.ts  (Plan 12.1 output — aggregate root)
- apps/notification-service/src/domain/entities/notification-template.ts  (Plan 12.1 output — template with render())
- apps/notification-service/src/domain/ports/notification-repository.port.ts  (Plan 12.1 output)
- apps/notification-service/src/domain/ports/template-repository.port.ts  (Plan 12.1 output)
- apps/notification-service/src/domain/ports/channel-provider.port.ts  (Plan 12.1 output)
- apps/notification-service/src/domain/ports/event-publisher.port.ts  (Plan 12.1 output)
- apps/inventory-service/src/application/handlers/reserve-stock.handler.ts  (reference for handler pattern with @Inject)
</context>

<tasks>

<task type="auto">
  <name>Create commands, query, and all 4 handlers</name>
  <files>
    apps/notification-service/src/application/commands/send-notification.command.ts
    apps/notification-service/src/application/commands/retry-notification.command.ts
    apps/notification-service/src/application/commands/move-to-dlq.command.ts
    apps/notification-service/src/application/queries/get-notification.query.ts
    apps/notification-service/src/application/handlers/send-notification.handler.ts
    apps/notification-service/src/application/handlers/retry-notification.handler.ts
    apps/notification-service/src/application/handlers/move-to-dlq.handler.ts
    apps/notification-service/src/application/handlers/get-notification.handler.ts
  </files>
  <action>
    **Commands** (plain TS classes, no decorators):

    **SendNotificationCommand**:
    ```ts
    export class SendNotificationCommand {
      constructor(
        public readonly recipientId: string,
        public readonly channel: NotificationChannel,
        public readonly templateSlug: string,
        public readonly variables: Record<string, string>,
        public readonly correlationId: string,
        public readonly priority?: NotificationPriority,
        public readonly recipientEmail?: string,
        public readonly recipientPhone?: string,
        public readonly metadata?: Record<string, unknown>,
      ) {}
    }
    ```

    **RetryNotificationCommand**:
    ```ts
    export class RetryNotificationCommand {
      constructor(public readonly notificationId: string) {}
    }
    ```

    **MoveToDlqCommand**:
    ```ts
    export class MoveToDlqCommand {
      constructor(public readonly notificationId: string) {}
    }
    ```

    **GetNotificationQuery**:
    ```ts
    export class GetNotificationQuery {
      constructor(public readonly notificationId: string) {}
    }
    ```

    **SendNotificationHandler** (`@CommandHandler(SendNotificationCommand)`):
    - Inject via `@Inject(TEMPLATE_REPOSITORY)`, `@Inject(CHANNEL_PROVIDER_FACTORY)`, `@Inject(NOTIFICATION_REPOSITORY)`, `@Inject(EVENT_PUBLISHER)`
    - `execute(cmd)`:
      1. **Resolve template**: `await this.templateRepo.findBySlug(cmd.templateSlug)` → throw TemplateNotFoundError if null
      2. **Render content**: `const { subject, body } = template.render(cmd.variables)`
      3. **Create notification**: `Notification.create({ recipientId, channel, templateSlug, subject, body, priority, metadata, correlationId, recipientEmail, recipientPhone })`
      4. **Get provider**: `const provider = this.providerFactory.getProvider(cmd.channel)`
      5. **Attempt delivery**: `const result = await provider.send({ recipientId, recipientEmail, recipientPhone, subject, body, metadata })`
      6. **Handle result**:
         - If `result.success` → `notification.markSent()`
         - If `!result.success` → `notification.markFailed(result.errorMessage)` (domain decides retry/fail)
      7. **Persist**: `await this.notificationRepo.save(notification)`
      8. **Publish events**: `await this.eventPublisher.publishBatch(notification.pullEvents())`
      9. Return `notification.toJSON()`

    **RetryNotificationHandler** (`@CommandHandler(RetryNotificationCommand)`):
    - Inject same ports
    - `execute(cmd)`:
      1. Load notification by id → throw if null or status !== RETRYING
      2. Get provider for notification.channel
      3. Attempt delivery with provider.send()
      4. Handle result (markSent/markFailed)
      5. Save, publish events

    **MoveToDlqHandler** (`@CommandHandler(MoveToDlqCommand)`):
    - Load notification by id → throw if null or status !== FAILED
    - Call notification.markDlq()
    - Save, publish events
    - Log warning with full notification context

    **GetNotificationHandler** (`@QueryHandler(GetNotificationQuery)`):
    - Load notification by id → throw NotFoundException if null
    - Return notification.toJSON()

    AVOID importing concrete providers (SendGrid, Twilio) in any handler — use only port interfaces.
    AVOID placing retry logic in handlers — it's in the Notification entity's markFailed() method.
  </action>
  <verify>npx tsc --noEmit 2>&1 | grep -E "handler|command|query" || echo "Application layer compiles OK"</verify>
  <done>4 handlers implement @CommandHandler/@QueryHandler. SendNotificationHandler resolves template, renders variables, dispatches via provider factory, handles success/failure via domain methods. All handlers use port interfaces via @Inject. Retry scheduling is in domain, not handlers.</done>
</task>

<task type="auto">
  <name>Create NotificationOrchestrator for event-to-notification mapping</name>
  <files>
    apps/notification-service/src/application/services/notification-orchestrator.service.ts
  </files>
  <action>
    **NotificationOrchestrator** — the central mapping service:
    - Injectable service (uses @Injectable() from NestJS — this is the application layer boundary)
    - Inject `CommandBus` from `@nestjs/cqrs`
    - Purpose: Maps external event types to SendNotificationCommand instances

    Methods (one per event type):

    **handleUserRegistered(payload: { userId, email, userName })**:
    - Create `SendNotificationCommand(userId, EMAIL, 'welcome-email', { userName, email }, correlationId, NORMAL, email)`

    **handleOrderCreated(payload: { userId, orderId, email, userName, totalAmount })**:
    - Create `SendNotificationCommand(userId, EMAIL, 'order-confirmation-email', { userName, orderId, totalAmount }, correlationId, NORMAL, email)`

    **handleOrderPaid(payload: { userId, orderId, email, userName, totalAmount })**:
    - Create `SendNotificationCommand(userId, EMAIL, 'payment-confirmation-email', { userName, orderId, totalAmount }, correlationId, HIGH, email)`

    **handleOrderShipped(payload: { userId, orderId, email, userName, trackingNumber?, carrier? })**:
    - Create `SendNotificationCommand(userId, EMAIL, 'shipping-notification', { userName, orderId, trackingNumber, carrier }, correlationId, NORMAL, email)`

    **handleCartAbandoned(payload: { userId, email, userName, cartId, itemCount })**:
    - Create `SendNotificationCommand(userId, EMAIL, 'cart-abandoned', { userName, cartId, itemCount }, correlationId, LOW, email)`

    Each method:
    1. Generates correlationId from event data
    2. Creates the appropriate SendNotificationCommand
    3. Dispatches via `this.commandBus.execute(command)`
    4. Returns the result

    AVOID hardcoding email addresses — they come from the event payload.
    AVOID duplicating template rendering logic — that's in the handler.
    NOTE: This is the ONLY place that knows the mapping between events and notifications. Kafka consumers just call the appropriate method.
  </action>
  <verify>npx tsc --noEmit 2>&1 | grep -E "orchestrator" || echo "Orchestrator compiles OK"</verify>
  <done>NotificationOrchestrator has 5 handler methods mapping event types to notification commands. Each method creates the right SendNotificationCommand with correct template slug, channel, and variables. All dispatch via CommandBus. Single responsibility: event-to-notification mapping.</done>
</task>

</tasks>

<verification>
After all tasks:
- [ ] `npx tsc --noEmit` produces zero errors for application/ files
- [ ] No direct SendGrid, Twilio, or Firebase import appears in any handler file
- [ ] SendNotificationHandler resolves template, renders variables, dispatches to provider
- [ ] NotificationOrchestrator has 5 event handler methods
- [ ] All handlers inject ports by Symbol token
</verification>

<success_criteria>
- [ ] 3 commands, 1 query, 4 handlers, 1 orchestrator created
- [ ] Handlers inject ports by Symbol, not concrete classes
- [ ] TypeScript compiles without errors
- [ ] Event-to-notification mapping is centralized in orchestrator
</success_criteria>
