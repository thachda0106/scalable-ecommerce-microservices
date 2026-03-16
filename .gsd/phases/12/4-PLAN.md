---
phase: 12
plan: 4
wave: 2
depends_on: [1]
files_modified:
  - apps/notification-service/src/infrastructure/providers/sendgrid-email.provider.ts
  - apps/notification-service/src/infrastructure/providers/twilio-sms.provider.ts
  - apps/notification-service/src/infrastructure/providers/firebase-push.provider.ts
  - apps/notification-service/src/infrastructure/providers/in-app.provider.ts
  - apps/notification-service/src/infrastructure/providers/channel-provider.factory.ts
  - apps/notification-service/src/infrastructure/repositories/in-memory-notification.repository.ts
  - apps/notification-service/src/infrastructure/repositories/in-memory-template.repository.ts
  - apps/notification-service/src/infrastructure/templates/template-seed.ts
autonomous: true
user_setup: []

must_haves:
  truths:
    - "All 4 channel providers implement IChannelProvider interface"
    - "ChannelProviderFactory returns the correct provider for each NotificationChannel enum value"
    - "Providers are mock implementations with structured logging (real integrations are future work)"
    - "In-memory repositories implement INotificationRepository and ITemplateRepository interfaces"
    - "Template seed provides at least 5 predefined templates for all event types"
  artifacts:
    - "apps/notification-service/src/infrastructure/providers/channel-provider.factory.ts exists"
    - "apps/notification-service/src/infrastructure/providers/sendgrid-email.provider.ts exists"
    - "apps/notification-service/src/infrastructure/repositories/in-memory-template.repository.ts exists"
    - "apps/notification-service/src/infrastructure/templates/template-seed.ts exists"
---

# Plan 12.4: Infrastructure — Providers, Repositories & Template Seeds

<objective>
Implement the infrastructure layer: channel provider implementations (mock SendGrid, Twilio, Firebase, InApp), the ChannelProviderFactory, in-memory repositories, and predefined notification templates.

Purpose: These are the concrete implementations of domain port interfaces. Providers are mock for now — real integrations are a future concern. Templates are seeded with all the predefined notification types.
Output: 5 provider files, 2 repository files, 1 template seed file.
</objective>

<context>
Load for context:
- apps/notification-service/src/domain/ports/channel-provider.port.ts  (Plan 12.1 — interface to implement)
- apps/notification-service/src/domain/ports/notification-repository.port.ts  (Plan 12.1 — interface to implement)
- apps/notification-service/src/domain/ports/template-repository.port.ts  (Plan 12.1 — interface to implement)
- apps/notification-service/src/domain/entities/notification-template.ts  (Plan 12.1 — entity for templates)
- apps/notification-service/src/domain/enums/notification-channel.enum.ts  (Plan 12.1)
- apps/notification-service/src/notification/notification.service.ts  (current mock service — pattern reference for logging)
</context>

<tasks>

<task type="auto">
  <name>Create channel providers and factory</name>
  <files>
    apps/notification-service/src/infrastructure/providers/sendgrid-email.provider.ts
    apps/notification-service/src/infrastructure/providers/twilio-sms.provider.ts
    apps/notification-service/src/infrastructure/providers/firebase-push.provider.ts
    apps/notification-service/src/infrastructure/providers/in-app.provider.ts
    apps/notification-service/src/infrastructure/providers/channel-provider.factory.ts
  </files>
  <action>
    Each provider implements `IChannelProvider` from the domain ports.

    **SendGridEmailProvider**:
    ```ts
    @Injectable()
    export class SendGridEmailProvider implements IChannelProvider {
      readonly channel = NotificationChannel.EMAIL;
      private readonly logger = new Logger(SendGridEmailProvider.name);

      async send(payload: ChannelPayload): Promise<ChannelResult> {
        // Mock implementation — in production, this would call SendGrid API
        // const sgMail = require('@sendgrid/mail');
        this.logger.log(`[MOCK EMAIL] To: ${payload.recipientEmail} | Subject: ${payload.subject}`);
        this.logger.debug(`[MOCK EMAIL BODY]\n${payload.body}`);

        // Simulate occasional failures for testing retry logic (10% failure rate in dev)
        if (process.env.MOCK_FAILURE_RATE && Math.random() < parseFloat(process.env.MOCK_FAILURE_RATE)) {
          return { success: false, errorMessage: 'Simulated SendGrid delivery failure' };
        }

        return {
          success: true,
          providerMessageId: `sg-mock-${crypto.randomUUID()}`,
        };
      }
    }
    ```

    **TwilioSmsProvider** — same pattern for SMS:
    - channel = NotificationChannel.SMS
    - Logs `[MOCK SMS] To: ${payload.recipientPhone} | Message: ${payload.body}`
    - Returns mock success with `twilio-mock-${UUID}`

    **FirebasePushProvider** — same pattern for PUSH:
    - channel = NotificationChannel.PUSH
    - Logs `[MOCK PUSH] To: ${payload.recipientId} | Title: ${payload.subject}`
    - Returns mock success with `fcm-mock-${UUID}`

    **InAppProvider** — simplest provider:
    - channel = NotificationChannel.IN_APP
    - Logs `[IN-APP] User: ${payload.recipientId} | ${payload.subject}`
    - Always returns success (in-app notifications don't fail externally)

    **ChannelProviderFactory** — implements `IChannelProviderFactory`:
    ```ts
    @Injectable()
    export class ChannelProviderFactory implements IChannelProviderFactory {
      private readonly providers: Map<NotificationChannel, IChannelProvider>;

      constructor(
        private readonly emailProvider: SendGridEmailProvider,
        private readonly smsProvider: TwilioSmsProvider,
        private readonly pushProvider: FirebasePushProvider,
        private readonly inAppProvider: InAppProvider,
      ) {
        this.providers = new Map([
          [NotificationChannel.EMAIL, emailProvider],
          [NotificationChannel.SMS, smsProvider],
          [NotificationChannel.PUSH, pushProvider],
          [NotificationChannel.IN_APP, inAppProvider],
        ]);
      }

      getProvider(channel: NotificationChannel): IChannelProvider {
        const provider = this.providers.get(channel);
        if (!provider) {
          throw new InvalidChannelError(channel);
        }
        return provider;
      }
    }
    ```

    AVOID real API calls — these are mock implementations.
    NOTE: Each provider can be independently replaced with a real implementation later without changing any other code.
  </action>
  <verify>npx tsc --noEmit 2>&1 | grep -E "providers" || echo "Providers compile OK"</verify>
  <done>4 channel providers implement IChannelProvider (email, sms, push, in-app). ChannelProviderFactory maps NotificationChannel enum to correct provider. All providers are mock with structured logging. Email provider supports MOCK_FAILURE_RATE env for testing retry logic.</done>
</task>

<task type="auto">
  <name>Create in-memory repositories and template seeds</name>
  <files>
    apps/notification-service/src/infrastructure/repositories/in-memory-notification.repository.ts
    apps/notification-service/src/infrastructure/repositories/in-memory-template.repository.ts
    apps/notification-service/src/infrastructure/templates/template-seed.ts
  </files>
  <action>
    **InMemoryNotificationRepository** — implements `INotificationRepository`:
    ```ts
    @Injectable()
    export class InMemoryNotificationRepository implements INotificationRepository {
      private readonly notifications: Map<string, Notification> = new Map();
      private readonly logger = new Logger(InMemoryNotificationRepository.name);

      async save(notification: Notification): Promise<void> {
        const json = notification.toJSON();
        this.notifications.set(json.id, notification);
        this.logger.debug(`Notification ${json.id} saved (status: ${json.status})`);
      }

      async findById(id: string): Promise<Notification | null> {
        return this.notifications.get(id) || null;
      }

      async findByCorrelationId(correlationId: string): Promise<Notification[]> {
        return Array.from(this.notifications.values()).filter(
          (n) => n.toJSON().correlationId === correlationId,
        );
      }

      async findPendingRetries(limit: number): Promise<Notification[]> {
        const now = new Date();
        return Array.from(this.notifications.values())
          .filter((n) => {
            const json = n.toJSON();
            return json.status === 'RETRYING' && json.nextRetryAt && new Date(json.nextRetryAt) <= now;
          })
          .slice(0, limit);
      }

      async findFailedForDlq(limit: number): Promise<Notification[]> {
        return Array.from(this.notifications.values())
          .filter((n) => n.toJSON().status === 'FAILED')
          .slice(0, limit);
      }
    }
    ```

    **InMemoryTemplateRepository** — implements `ITemplateRepository`:
    - Uses a Map keyed on slug
    - `findBySlug(slug)` — returns template or null
    - `findAll()` — returns all templates
    - `save(template)` — adds to map
    - Calls `seedTemplates()` on construction (via OnModuleInit)

    **template-seed.ts** — predefined templates:
    ```ts
    export function createTemplateSeeds(): NotificationTemplate[] {
      return [
        NotificationTemplate.create({
          slug: 'welcome-email',
          name: 'Welcome Email',
          channel: NotificationChannel.EMAIL,
          subjectTemplate: 'Welcome to Our Store, {{userName}}!',
          bodyTemplate: 'Hi {{userName}},\n\nThank you for registering! Your account is ready.\n\nHappy shopping!',
          requiredVariables: ['userName'],
        }),
        NotificationTemplate.create({
          slug: 'order-confirmation-email',
          name: 'Order Confirmation',
          channel: NotificationChannel.EMAIL,
          subjectTemplate: 'Order #{{orderId}} Confirmed',
          bodyTemplate: 'Hi {{userName}},\n\nYour order #{{orderId}} for ${{totalAmount}} has been placed successfully.\n\nThank you for your purchase!',
          requiredVariables: ['userName', 'orderId', 'totalAmount'],
        }),
        NotificationTemplate.create({
          slug: 'payment-confirmation-email',
          name: 'Payment Confirmation',
          channel: NotificationChannel.EMAIL,
          subjectTemplate: 'Payment Received for Order #{{orderId}}',
          bodyTemplate: 'Hi {{userName}},\n\nWe have received your payment of ${{totalAmount}} for order #{{orderId}}.\n\nYour order is now being processed.',
          requiredVariables: ['userName', 'orderId', 'totalAmount'],
        }),
        NotificationTemplate.create({
          slug: 'shipping-notification',
          name: 'Shipping Notification',
          channel: NotificationChannel.EMAIL,
          subjectTemplate: 'Your Order #{{orderId}} Has Shipped!',
          bodyTemplate: 'Hi {{userName}},\n\nGreat news! Your order #{{orderId}} has been shipped.\n\nTracking: {{trackingNumber}} via {{carrier}}',
          requiredVariables: ['userName', 'orderId', 'trackingNumber', 'carrier'],
        }),
        NotificationTemplate.create({
          slug: 'cart-abandoned',
          name: 'Cart Abandoned Reminder',
          channel: NotificationChannel.EMAIL,
          subjectTemplate: 'You left {{itemCount}} items in your cart!',
          bodyTemplate: 'Hi {{userName}},\n\nYou have {{itemCount}} items waiting in your cart.\n\nComplete your purchase before they sell out!',
          requiredVariables: ['userName', 'itemCount'],
        }),
      ];
    }
    ```

    AVOID TypeORM or database dependencies — these are in-memory for now.
    NOTE: When migrating to persistent storage, only these repository files need to change. Domain and application layers are unaffected.
  </action>
  <verify>npx tsc --noEmit 2>&1 | grep -E "repositories|templates" || echo "Repositories and templates compile OK"</verify>
  <done>InMemoryNotificationRepository supports save, findById, findPendingRetries, findFailedForDlq. InMemoryTemplateRepository loads 5 predefined templates on init. Templates cover all 5 event types (welcome, order confirmation, payment confirmation, shipping, cart abandoned). All implement port interfaces.</done>
</task>

</tasks>

<verification>
After all tasks:
- [ ] `npx tsc --noEmit` produces zero errors for infrastructure/ files
- [ ] All 4 providers implement IChannelProvider interface
- [ ] ChannelProviderFactory.getProvider() returns correct provider for each channel
- [ ] In-memory repositories implement the port interfaces
- [ ] 5 template seeds exist with correct requiredVariables
</verification>

<success_criteria>
- [ ] 5 provider files, 2 repository files, 1 template seed file created
- [ ] Factory pattern correctly maps channels to providers
- [ ] In-memory repositories support all required queries
- [ ] TypeScript compiles without errors
</success_criteria>
