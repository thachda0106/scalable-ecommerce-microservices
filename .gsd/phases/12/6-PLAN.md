---
phase: 12
plan: 6
wave: 3
depends_on: [1, 2, 4, 5]
files_modified:
  - apps/notification-service/src/domain/entities/__tests__/notification.spec.ts
  - apps/notification-service/src/domain/entities/__tests__/notification-template.spec.ts
  - apps/notification-service/src/application/handlers/__tests__/send-notification.handler.spec.ts
  - apps/notification-service/src/application/handlers/__tests__/retry-notification.handler.spec.ts
  - apps/notification-service/src/infrastructure/providers/__tests__/channel-provider.factory.spec.ts
autonomous: true
user_setup: []

must_haves:
  truths:
    - "Domain entity tests verify Notification lifecycle state machine (PENDING → SENT, PENDING → RETRYING → SENT, PENDING → RETRYING → FAILED)"
    - "Template tests verify variable interpolation and missing variable validation"
    - "Handler tests mock all port interfaces and verify orchestration flow"
    - "All tests pass with `pnpm test` or `npx jest`"
    - "TypeScript compiles with zero errors"
  artifacts:
    - "apps/notification-service/src/domain/entities/__tests__/notification.spec.ts exists"
    - "apps/notification-service/src/domain/entities/__tests__/notification-template.spec.ts exists"
    - "apps/notification-service/src/application/handlers/__tests__/send-notification.handler.spec.ts exists"
---

# Plan 12.6: Tests — Domain, Handler & Provider Tests

<objective>
Write comprehensive unit tests covering the domain layer (Notification lifecycle, template rendering), application layer (handler orchestration with mocked ports), and infrastructure layer (provider factory).

Purpose: Prove the architecture works as designed. Tests are the empirical evidence required by GSD.
Output: 5 test files.
</objective>

<context>
Load for context:
- apps/notification-service/src/domain/entities/notification.ts  (Plan 12.1 output)
- apps/notification-service/src/domain/entities/notification-template.ts  (Plan 12.1 output)
- apps/notification-service/src/application/handlers/send-notification.handler.ts  (Plan 12.2 output)
- apps/notification-service/src/infrastructure/providers/channel-provider.factory.ts  (Plan 12.4 output)
- apps/cart-service/src/domain/entities/__tests__/cart.entity.spec.ts  (reference test pattern)
</context>

<tasks>

<task type="auto">
  <name>Write domain entity unit tests</name>
  <files>
    apps/notification-service/src/domain/entities/__tests__/notification.spec.ts
    apps/notification-service/src/domain/entities/__tests__/notification-template.spec.ts
  </files>
  <action>
    **notification.spec.ts** — test the Notification aggregate lifecycle:

    ```ts
    describe('Notification', () => {
      const createNotification = (overrides = {}) =>
        Notification.create({
          recipientId: 'user-123',
          channel: NotificationChannel.EMAIL,
          templateSlug: 'order-confirmation-email',
          subject: 'Order #456 Confirmed',
          body: 'Hi John, your order is confirmed.',
          correlationId: 'correlation-abc',
          recipientEmail: 'user@example.com',
          ...overrides,
        });

      describe('create', () => {
        it('should create with PENDING status', () => { ... });
        it('should set attempt to 0', () => { ... });
        it('should set maxRetries to 3 by default', () => { ... });
        it('should generate a UUID id', () => { ... });
      });

      describe('markSent', () => {
        it('should set status to SENT', () => { ... });
        it('should set sentAt timestamp', () => { ... });
        it('should emit NotificationSentEvent', () => { ... });
      });

      describe('markFailed', () => {
        it('should set status to RETRYING when attempt < maxRetries', () => {
          const notification = createNotification();
          notification.markFailed('Timeout');
          expect(notification.toJSON().status).toBe('RETRYING');
          expect(notification.toJSON().attempt).toBe(1);
          expect(notification.toJSON().nextRetryAt).toBeDefined();
        });

        it('should calculate exponential backoff for nextRetryAt', () => {
          const notification = createNotification();
          notification.markFailed('Timeout'); // attempt 1 → 2^1 * 1000 = 2s backoff
          const retry1 = notification.toJSON().nextRetryAt;

          notification.markFailed('Timeout'); // attempt 2 → 2^2 * 1000 = 4s backoff
          const retry2 = notification.toJSON().nextRetryAt;

          // 2nd retry should be further in the future than 1st
          expect(new Date(retry2!).getTime()).toBeGreaterThan(new Date(retry1!).getTime());
        });

        it('should set status to FAILED when attempt >= maxRetries', () => {
          const notification = createNotification({ maxRetries: 2 });
          notification.markFailed('Fail 1'); // attempt 1 → RETRYING
          notification.markFailed('Fail 2'); // attempt 2 → FAILED (>= maxRetries)
          expect(notification.toJSON().status).toBe('FAILED');
        });

        it('should emit NotificationRetryScheduledEvent when retrying', () => { ... });
        it('should emit NotificationFailedEvent when max retries exhausted', () => { ... });
      });

      describe('markDlq', () => {
        it('should only work when status is FAILED', () => { ... });
        it('should set status to DLQ', () => { ... });
      });

      describe('pullEvents', () => {
        it('should return events and clear buffer', () => { ... });
      });
    });
    ```

    **notification-template.spec.ts** — test template rendering:
    ```ts
    describe('NotificationTemplate', () => {
      describe('render', () => {
        it('should replace all {{variable}} placeholders', () => {
          const template = NotificationTemplate.create({
            slug: 'test', name: 'Test',
            channel: NotificationChannel.EMAIL,
            subjectTemplate: 'Hello {{userName}}',
            bodyTemplate: 'Order #{{orderId}} for ${{totalAmount}}',
            requiredVariables: ['userName', 'orderId', 'totalAmount'],
          });

          const result = template.render({
            userName: 'John', orderId: '123', totalAmount: '99.99',
          });

          expect(result.subject).toBe('Hello John');
          expect(result.body).toBe('Order #123 for $99.99');
        });

        it('should throw when a required variable is missing', () => {
          const template = NotificationTemplate.create({
            slug: 'test', name: 'Test',
            channel: NotificationChannel.EMAIL,
            subjectTemplate: 'Hello {{userName}}',
            bodyTemplate: 'Your order',
            requiredVariables: ['userName'],
          });

          expect(() => template.render({})).toThrow();
        });

        it('should handle templates with no variables', () => { ... });
      });
    });
    ```

    AVOID testing NestJS DI wiring — that's integration testing territory.
    Test pure domain logic only in these files.
  </action>
  <verify>cd apps/notification-service && npx jest --testPathPattern="domain" --passWithNoTests 2>&1 | tail -5</verify>
  <done>Notification lifecycle tests pass: create → PENDING, markSent → SENT, markFailed → RETRYING/FAILED based on attempt count, markDlq → DLQ. Exponential backoff is verified. Template render tests pass: variable interpolation works, missing variables throw.</done>
</task>

<task type="auto">
  <name>Write handler and provider factory tests</name>
  <files>
    apps/notification-service/src/application/handlers/__tests__/send-notification.handler.spec.ts
    apps/notification-service/src/application/handlers/__tests__/retry-notification.handler.spec.ts
    apps/notification-service/src/infrastructure/providers/__tests__/channel-provider.factory.spec.ts
  </files>
  <action>
    **send-notification.handler.spec.ts** — test handler orchestration with mocked ports:
    ```ts
    describe('SendNotificationHandler', () => {
      let handler: SendNotificationHandler;
      let mockTemplateRepo: jest.Mocked<ITemplateRepository>;
      let mockNotificationRepo: jest.Mocked<INotificationRepository>;
      let mockProviderFactory: jest.Mocked<IChannelProviderFactory>;
      let mockEventPublisher: jest.Mocked<IEventPublisher>;

      beforeEach(() => {
        // Create jest mocks for all ports
        mockTemplateRepo = { findBySlug: jest.fn(), findAll: jest.fn(), save: jest.fn() };
        mockNotificationRepo = { save: jest.fn(), findById: jest.fn(), /* ... */ };
        mockProviderFactory = { getProvider: jest.fn() };
        mockEventPublisher = { publish: jest.fn(), publishBatch: jest.fn() };

        handler = new SendNotificationHandler(
          mockTemplateRepo, mockProviderFactory,
          mockNotificationRepo, mockEventPublisher,
        );
      });

      it('should resolve template, render, dispatch via provider, and persist', async () => {
        // Setup: template exists, provider returns success
        const mockTemplate = NotificationTemplate.create({ ... });
        mockTemplateRepo.findBySlug.mockResolvedValue(mockTemplate);
        const mockProvider: jest.Mocked<IChannelProvider> = {
          channel: NotificationChannel.EMAIL,
          send: jest.fn().mockResolvedValue({ success: true, providerMessageId: 'msg-1' }),
        };
        mockProviderFactory.getProvider.mockReturnValue(mockProvider);
        mockNotificationRepo.save.mockResolvedValue();
        mockEventPublisher.publishBatch.mockResolvedValue();

        const result = await handler.execute(new SendNotificationCommand(
          'user-1', NotificationChannel.EMAIL, 'order-confirmation-email',
          { userName: 'John', orderId: '123', totalAmount: '99' },
          'corr-1',
        ));

        expect(mockTemplateRepo.findBySlug).toHaveBeenCalledWith('order-confirmation-email');
        expect(mockProvider.send).toHaveBeenCalled();
        expect(mockNotificationRepo.save).toHaveBeenCalled();
        expect(result.status).toBe('SENT');
      });

      it('should throw TemplateNotFoundError when template does not exist', async () => { ... });

      it('should mark notification as RETRYING when provider delivery fails', async () => { ... });
    });
    ```

    **retry-notification.handler.spec.ts**:
    - Mock repo to return a RETRYING notification
    - Verify handler re-dispatches to provider
    - Verify markSent on success, markFailed on failure

    **channel-provider.factory.spec.ts**:
    ```ts
    describe('ChannelProviderFactory', () => {
      it('should return email provider for EMAIL channel', () => { ... });
      it('should return sms provider for SMS channel', () => { ... });
      it('should return push provider for PUSH channel', () => { ... });
      it('should return in-app provider for IN_APP channel', () => { ... });
      it('should throw InvalidChannelError for unknown channel', () => { ... });
    });
    ```

    AVOID testing concrete provider implementations (they're mocks anyway).
    Focus on verifying the handler orchestration flow and factory mapping.
  </action>
  <verify>cd apps/notification-service && npx jest --passWithNoTests 2>&1 | tail -10</verify>
  <done>Handler tests verify the full orchestration flow: template resolution, rendering, provider dispatch, persistence, event publishing. Mocked ports confirm clean separation. Provider factory tests verify correct channel-to-provider mapping. All tests pass.</done>
</task>

</tasks>

<verification>
After all tasks:
- [ ] `npx jest` passes all tests in notification-service
- [ ] `npx tsc --noEmit` shows zero errors
- [ ] Domain tests cover: Notification lifecycle (PENDING→SENT, PENDING→RETRYING→SENT, PENDING→RETRYING→FAILED), template rendering, missing variable validation
- [ ] Handler tests verify complete orchestration flow with mocked ports
- [ ] Provider factory tests verify channel-to-provider mapping
</verification>

<success_criteria>
- [ ] 5 test files created
- [ ] All tests pass
- [ ] Domain logic is empirically verified
- [ ] Handler orchestration is empirically verified
- [ ] TypeScript compiles without errors
</success_criteria>
