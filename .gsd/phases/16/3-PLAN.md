---
phase: 16
plan: 3
wave: 2
---

# Plan 16.3: Infrastructure Layer — Provider Strategy, Persistence & Kafka

## Objective
Build the infrastructure layer implementing the domain port interfaces. Includes payment provider strategy pattern (Stripe/PayPal/Mock), TypeORM persistence with entity mappers, Kafka event publisher (outbox relay), Kafka command consumer (payment.commands topic), and idempotency/retry/DLQ mechanisms.

## Context
- .gsd/phases/16/RESEARCH.md (decisions: outbox pattern, payment.commands topic, event format)
- apps/payment-service/src/domain/ports/ (built in Plan 16.1)
- apps/payment-service/src/application/ports/ (built in Plan 16.2)
- apps/payment-service/src/outbox/ (existing outbox relay to keep/improve)
- apps/order-service/src/infrastructure/ (reference patterns)
- apps/order-service/src/infrastructure/external-services/kafka-payment.service.ts (publishes to payment.commands: { type: 'ProcessPayment', payload: { orderId, amountInCents, currency, userId } })

## Tasks

<task type="auto">
  <name>Create payment provider implementations and factory</name>
  <files>
    apps/payment-service/src/infrastructure/providers/stripe.provider.ts [NEW]
    apps/payment-service/src/infrastructure/providers/paypal.provider.ts [NEW]
    apps/payment-service/src/infrastructure/providers/mock.provider.ts [NEW]
    apps/payment-service/src/infrastructure/providers/payment-provider.factory.ts [NEW]
    apps/payment-service/src/infrastructure/providers/index.ts [NEW]
  </files>
  <action>
    1. **MockProvider** — Implements IPaymentProvider. processPayment() always succeeds with a mock transactionId (uuid). refundPayment() always succeeds. getName() returns PaymentProviderEnum.MOCK. Add configurable success rate via constructor option for testing scenarios.

    2. **StripeProvider** — Implements IPaymentProvider. processPayment() simulates Stripe API call (log + return mock result). refundPayment() simulates refund API call. Include timeout handling (30s) via Promise.race/AbortController. In a real system would use Stripe SDK — document this with TODO comments.

    3. **PayPalProvider** — Same pattern as Stripe, simulated. Document with TODO for real PayPal SDK integration.

    4. **PaymentProviderFactory** — Implements IPaymentProviderFactory. Constructor receives all providers via DI. getProvider(name) returns correct provider or throws. Acts as strategy selector.

    **Anti-patterns to avoid:**
    - Do NOT put real API keys or SDK calls — this is simulation layer
    - Do NOT couple providers to NestJS (keep them injectable but logic is pure)
    - Do NOT hardcode provider selection — factory uses enum-based lookup
  </action>
  <verify>npx tsc --noEmit --project apps/payment-service/tsconfig.json</verify>
  <done>
    - 3 provider implementations (Mock, Stripe, PayPal) all implement IPaymentProvider
    - Factory implements IPaymentProviderFactory with enum-based lookup
    - MockProvider always succeeds for reliable tests
    - Stripe/PayPal have timeout handling (30s)
  </done>
</task>

<task type="auto">
  <name>Create TypeORM persistence layer (entities, mappers, repositories)</name>
  <files>
    apps/payment-service/src/infrastructure/persistence/entities/payment.orm-entity.ts [NEW]
    apps/payment-service/src/infrastructure/persistence/entities/outbox-event.orm-entity.ts [NEW]
    apps/payment-service/src/infrastructure/persistence/entities/processed-event.orm-entity.ts [NEW]
    apps/payment-service/src/infrastructure/persistence/mappers/payment.mapper.ts [NEW]
    apps/payment-service/src/infrastructure/persistence/repositories/typeorm-payment.repository.ts [NEW]
    apps/payment-service/src/infrastructure/persistence/index.ts [NEW]
  </files>
  <action>
    1. **PaymentOrmEntity** — TypeORM entity `payment_transactions` table with columns: id (UUID PK), orderId (indexed), userId, amountInCents (int), currency (varchar), status (enum), provider (varchar), transactionId (nullable), idempotencyKey (nullable, unique indexed), failReason (nullable), createdAt, updatedAt. Include index on (orderId) and unique index on (idempotencyKey).

    2. **OutboxEventOrmEntity** — Same as existing OutboxEvent but renamed to OrmEntity naming convention. Keep existing schema (id, type, payload JSONB, processed, createdAt).

    3. **ProcessedEventOrmEntity** — For consumer idempotency. Columns: id (auto), eventId (unique), eventType, processedAt. Follow order-service pattern.

    4. **PaymentMapper** — Static methods:
       - `toDomain(orm: PaymentOrmEntity): Payment` — Maps ORM entity to domain aggregate via Payment.reconstitute()
       - `toOrm(domain: Payment): PaymentOrmEntity` — Maps domain aggregate to ORM entity

    5. **TypeOrmPaymentRepository** — Implements IPaymentRepository:
       - `save(payment)` — Maps to ORM, saves, also persists domain events into outbox table in same transaction
       - `findById(id)` — Finds ORM entity, maps to domain via PaymentMapper
       - `findByOrderId(orderId)` — Query by orderId index
       - `findByIdempotencyKey(key)` — Query by unique idempotency key index

    **Anti-patterns to avoid:**
    - Do NOT use ORM entities as domain entities — always map through PaymentMapper
    - Do NOT skip the outbox write in save() — event consistency requires it
    - Do NOT skip the unique index on idempotencyKey
  </action>
  <verify>npx tsc --noEmit --project apps/payment-service/tsconfig.json</verify>
  <done>
    - 3 ORM entities with proper indexes
    - PaymentMapper maps bidirectionally between domain and ORM
    - TypeOrmPaymentRepository implements IPaymentRepository with transactional outbox writes
    - Idempotency key has unique index for duplicate prevention
  </done>
</task>

<task type="auto">
  <name>Create Kafka consumer, event publisher, and outbox relay</name>
  <files>
    apps/payment-service/src/infrastructure/kafka/kafka-client.factory.ts [NEW]
    apps/payment-service/src/infrastructure/kafka/consumers/payment-command.consumer.ts [NEW]
    apps/payment-service/src/infrastructure/kafka/kafka-event-publisher.ts [NEW]
    apps/payment-service/src/infrastructure/kafka/outbox-relay.service.ts [NEW]
    apps/payment-service/src/infrastructure/kafka/index.ts [NEW]
  </files>
  <action>
    1. **KafkaClientFactory** — Shared Kafka client creation. Configurable brokers from env (`KAFKA_BROKERS`). Methods: createProducer(), createConsumer(config). Follow order-service's KafkaClientFactory pattern.

    2. **PaymentCommandConsumer** — Subscribes to `payment.commands` topic (THIS IS CRITICAL — matches order-service publisher). On receiving message:
       - Parse message: `{ type: 'ProcessPayment', payload: { orderId, amountInCents, currency, userId } }`
       - Idempotency check: check processed_events table for eventId
       - If `type === 'ProcessPayment'`: create ProcessPaymentCommand and delegate to ProcessPaymentHandler
       - Mark event as processed in processed_events table
       - Error handling: log errors, DO NOT re-throw (prevent consumer crash loop)
       - After max retries (3), route message to `payment.commands.dlq` topic

    3. **KafkaEventPublisher** — Implements IEventPublisher. Uses outbox pattern (does NOT publish directly to Kafka). Saves events to outbox table. The outbox relay picks them up.

    4. **OutboxRelayService** — Refactored from existing outbox-relay. Keep cron-based polling (every second). Reads unprocessed outbox events, publishes to `payment.events` topic, marks as processed. Event format must match order-service's consumer expectations:
       ```json
       { "eventId": "uuid", "type": "PaymentProcessed"|"PaymentFailed", "payload": { "orderId", "paymentId", "transactionId", "success", "reason" }, "timestamp": "ISO date" }
       ```
       Map domain event types to outbox event types:
       - PaymentCompletedEvent → type: "PaymentProcessed"
       - PaymentFailedEvent → type: "PaymentFailed"

    **Anti-patterns to avoid:**
    - Do NOT consume `inventory.events` — the old topic. Consume `payment.commands`
    - Do NOT publish directly to Kafka from handlers — always go through outbox
    - Do NOT re-throw errors in consumer — log and skip to prevent crash loop
    - Do NOT change the outbox event format — order-service depends on { eventId, type, payload, timestamp }
  </action>
  <verify>npx tsc --noEmit --project apps/payment-service/tsconfig.json</verify>
  <done>
    - PaymentCommandConsumer subscribes to `payment.commands` topic (matches order-service publisher)
    - Outbox relay publishes to `payment.events` with backward-compatible format
    - Consumer has idempotency check + DLQ routing after 3 retries
    - KafkaEventPublisher saves events to outbox (not direct Kafka publish)
  </done>
</task>

## Success Criteria
- [ ] `npx tsc --noEmit` passes for payment-service
- [ ] PaymentCommandConsumer subscribes to `payment.commands` topic
- [ ] OutboxRelay publishes to `payment.events` with event format matching order-service expectations
- [ ] Provider factory returns correct provider based on PaymentProviderEnum
- [ ] TypeOrmPaymentRepository uses transactional write (payment + outbox in same transaction)
- [ ] Idempotency key unique index prevents duplicate payments
