---
phase: 12
plan: 3
wave: 2
depends_on: [2]
files_modified:
  - apps/notification-service/src/infrastructure/kafka/consumers/user-events.consumer.ts
  - apps/notification-service/src/infrastructure/kafka/consumers/order-events.consumer.ts
  - apps/notification-service/src/infrastructure/kafka/consumers/cart-events.consumer.ts
  - apps/notification-service/src/infrastructure/kafka/kafka.config.ts
  - apps/notification-service/src/infrastructure/kafka/kafka.module.ts
autonomous: true
user_setup: []

must_haves:
  truths:
    - "Three Kafka consumers subscribe to user.events, order.events, and cart.events topics"
    - "Each consumer parses event payload and delegates to NotificationOrchestrator"
    - "Consumers handle message parsing errors gracefully with logging"
    - "Consumer group IDs follow the pattern notification-service-{topic}"
    - "Kafka configuration is centralized and reads from environment variables"
  artifacts:
    - "apps/notification-service/src/infrastructure/kafka/consumers/user-events.consumer.ts exists"
    - "apps/notification-service/src/infrastructure/kafka/consumers/order-events.consumer.ts exists"
    - "apps/notification-service/src/infrastructure/kafka/consumers/cart-events.consumer.ts exists"
---

# Plan 12.3: Infrastructure — Kafka Consumers (Multi-Topic Event Handlers)

<objective>
Replace the existing single monolithic NotificationConsumerService with three focused Kafka consumers, each subscribing to its own topic. Each consumer parses incoming events and delegates to the NotificationOrchestrator.

This replaces: `src/consumer/notification-consumer.service.ts` (currently subscribes only to `order.events`)
With: Three dedicated consumers for `user.events`, `order.events`, and `cart.events`

Purpose: Separate concerns per event domain. Each consumer handles only its topic's events.
Output: 3 consumer files, 1 config, 1 module.
</objective>

<context>
Load for context:
- apps/notification-service/src/consumer/notification-consumer.service.ts  (current consumer — being replaced)
- apps/notification-service/src/application/services/notification-orchestrator.service.ts  (Plan 12.2 output — the delegation target)
</context>

<tasks>

<task type="auto">
  <name>Create Kafka configuration and module</name>
  <files>
    apps/notification-service/src/infrastructure/kafka/kafka.config.ts
    apps/notification-service/src/infrastructure/kafka/kafka.module.ts
  </files>
  <action>
    **kafka.config.ts** — centralized Kafka configuration:
    ```ts
    export const kafkaConfig = {
      clientId: process.env.KAFKA_CLIENT_ID || 'notification-service',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:29092').split(','),
      consumerGroups: {
        userEvents: process.env.KAFKA_GROUP_USER_EVENTS || 'notification-service-user-events',
        orderEvents: process.env.KAFKA_GROUP_ORDER_EVENTS || 'notification-service-order-events',
        cartEvents: process.env.KAFKA_GROUP_CART_EVENTS || 'notification-service-cart-events',
      },
      topics: {
        userEvents: process.env.KAFKA_TOPIC_USER_EVENTS || 'user.events',
        orderEvents: process.env.KAFKA_TOPIC_ORDER_EVENTS || 'order.events',
        cartEvents: process.env.KAFKA_TOPIC_CART_EVENTS || 'cart.events',
      },
      dlq: {
        topic: process.env.KAFKA_DLQ_TOPIC || 'notification.dlq',
      },
    };
    ```

    **kafka.module.ts** — NestJS module wiring all consumers:
    - Import Module from @nestjs/common
    - Import all 3 consumer services
    - Export module for use in AppModule
    - Mark consumers as providers (they self-connect via OnModuleInit)

    AVOID hardcoding broker addresses. All values come from environment with sensible defaults.
  </action>
  <verify>npx tsc --noEmit 2>&1 | grep -E "kafka" || echo "Kafka config compiles OK"</verify>
  <done>Centralized kafka.config.ts with env-based configuration. KafkaModule registers all 3 consumers. All broker addresses, group IDs, and topic names configurable via environment.</done>
</task>

<task type="auto">
  <name>Create three focused Kafka consumers</name>
  <files>
    apps/notification-service/src/infrastructure/kafka/consumers/user-events.consumer.ts
    apps/notification-service/src/infrastructure/kafka/consumers/order-events.consumer.ts
    apps/notification-service/src/infrastructure/kafka/consumers/cart-events.consumer.ts
  </files>
  <action>
    Each consumer follows the same pattern as the current `NotificationConsumerService` but is focused on one topic:

    **Base pattern for all consumers**:
    ```ts
    @Injectable()
    export class XxxEventsConsumer implements OnModuleInit, OnModuleDestroy {
      private readonly logger = new Logger(XxxEventsConsumer.name);
      private kafka: Kafka;
      private consumer: Consumer;

      constructor(private readonly orchestrator: NotificationOrchestrator) {
        this.kafka = new Kafka({
          clientId: kafkaConfig.clientId,
          brokers: kafkaConfig.brokers,
        });
        this.consumer = this.kafka.consumer({
          groupId: kafkaConfig.consumerGroups.xxxEvents,
        });
      }

      async onModuleInit() {
        await this.consumer.connect();
        await this.consumer.subscribe({
          topic: kafkaConfig.topics.xxxEvents,
          fromBeginning: false,      // Changed from true — don't replay all history
        });
        await this.consumer.run({
          eachMessage: async ({ message }) => {
            if (!message.value) return;
            try {
              const event = JSON.parse(message.value.toString());
              await this.handleEvent(event);
            } catch (error) {
              this.logger.error(`Error processing ${kafkaConfig.topics.xxxEvents} message: ${(error as Error).message}`, (error as Error).stack);
            }
          },
        });
        this.logger.log(`Consumer connected, listening to ${kafkaConfig.topics.xxxEvents}`);
      }

      async onModuleDestroy() {
        await this.consumer.disconnect();
      }

      private async handleEvent(event: { type: string; payload: any }) { ... }
    }
    ```

    **UserEventsConsumer.handleEvent**:
    - `type === 'UserRegistered'` → `this.orchestrator.handleUserRegistered(payload)`
    - Log and skip unknown types

    **OrderEventsConsumer.handleEvent**:
    - `type === 'OrderCreated'` → `this.orchestrator.handleOrderCreated(payload)`
    - `type === 'OrderConfirmed'` or `type === 'OrderPaid'` → `this.orchestrator.handleOrderPaid(payload)` (keep backward compat with existing 'OrderConfirmed' event type)
    - `type === 'OrderShipped'` → `this.orchestrator.handleOrderShipped(payload)`
    - `type === 'OrderFailed'` → Skip (no notification for failed orders currently, or create a failure notification)
    - Log and skip unknown types

    **CartEventsConsumer.handleEvent**:
    - `type === 'CartAbandoned'` → `this.orchestrator.handleCartAbandoned(payload)`
    - Log and skip unknown types

    CRITICAL: Set `fromBeginning: false` — we don't want to replay the entire topic history on service restart.
    AVOID duplicating orchestration logic in consumers — they only parse and delegate.
  </action>
  <verify>npx tsc --noEmit 2>&1 | grep -E "consumer" || echo "Consumers compile OK"</verify>
  <done>3 focused consumers exist, each subscribing to a single topic with its own consumer group. UserEventsConsumer handles UserRegistered. OrderEventsConsumer handles OrderCreated, OrderConfirmed/OrderPaid, OrderShipped. CartEventsConsumer handles CartAbandoned. All delegate to NotificationOrchestrator. fromBeginning set to false.</done>
</task>

</tasks>

<verification>
After all tasks:
- [ ] `npx tsc --noEmit` produces zero errors for kafka/ files
- [ ] 3 consumer files exist with correct topic subscriptions
- [ ] All consumers inject NotificationOrchestrator, not NotificationService
- [ ] Consumer group IDs are unique per consumer
- [ ] Kafka config reads from environment variables
</verification>

<success_criteria>
- [ ] 3 consumers, 1 config, 1 module created
- [ ] Each consumer subscribes to a single Kafka topic
- [ ] Consumers parse and delegate only — no business logic
- [ ] TypeScript compiles without errors
</success_criteria>
