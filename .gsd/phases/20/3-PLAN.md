---
phase: 20
plan: 3
wave: 2
---

# Plan 20.3: Event Architecture — Unified Naming, Versioning & Zod Validation

## Objective
Standardize event naming to dot-notation, add `schemaVersion` to all events, complete shared event contracts for all domains, and add Zod runtime validation schemas. This eliminates the fragile dual-format consumer pattern and prevents silent contract breakages.

## Context
- .gsd/phases/20/RESEARCH.md (Wave 2 findings)
- packages/events/src/index.ts
- packages/events/src/order.events.ts
- packages/events/src/payment.events.ts
- packages/events/src/inventory.events.ts
- packages/events/package.json

## Tasks

<task type="auto">
  <name>Add Zod dependency and create event envelope + all domain schemas</name>
  <files>
    packages/events/package.json (MODIFY — add zod dependency)
    packages/events/src/envelope.ts (NEW)
    packages/events/src/order.events.ts (MODIFY — add schemaVersion + Zod)
    packages/events/src/payment.events.ts (MODIFY — add schemaVersion + Zod)
    packages/events/src/inventory.events.ts (MODIFY — add schemaVersion + Zod)
    packages/events/src/user.events.ts (NEW)
    packages/events/src/cart.events.ts (NEW)
    packages/events/src/product.events.ts (NEW)
    packages/events/src/notification.events.ts (NEW)
    packages/events/src/index.ts (MODIFY — re-export all)
  </files>
  <action>
    1. Add `"zod": "^3.22.0"` to packages/events/package.json dependencies
    2. Create `envelope.ts` with a base event envelope:
       ```typescript
       import { z } from 'zod';
       export const EventEnvelopeSchema = z.object({
         type: z.string(),
         schemaVersion: z.number().int().positive(),
         source: z.string(),
         correlationId: z.string().uuid().optional(),
         timestamp: z.string().datetime(),
         payload: z.record(z.unknown()),
       });
       export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;
       ```
    3. Update existing event files to add `schemaVersion: 1` to every interface and create Zod schemas:
       - Each event gets a `z.object()` schema and an inferred TypeScript type
       - Keep backward-compatible interfaces alongside Zod schemas
    4. Create new event files for user, cart, product, notification domains
       - user.events.ts: UserCreated, UserUpdated, UserDeleted, UserSuspended
       - cart.events.ts: CartItemAdded, CartItemRemoved, CartCleared, CartExpired
       - product.events.ts: ProductCreated, ProductUpdated, ProductDeleted, ProductStockUpdated
       - notification.events.ts: NotificationSent, NotificationFailed
    5. Use dot-notation for topic constants: `user.events`, `cart.events`, `product.events`
    6. Update index.ts to export all new modules
  </action>
  <verify>cd packages/events && npx tsc --noEmit</verify>
  <done>All event schemas compile; every event interface has schemaVersion field</done>
</task>

<task type="auto">
  <name>Remove dual-format case blocks from all consumers</name>
  <files>
    apps/notification-service/src/infrastructure/kafka/consumers/order-events.consumer.ts
    apps/notification-service/src/infrastructure/kafka/consumers/user-events.consumer.ts
    apps/notification-service/src/infrastructure/kafka/consumers/cart-events.consumer.ts
    apps/inventory-service/src/infrastructure/messaging/order-event-consumer.ts
    apps/order-service/src/infrastructure/kafka/consumers/inventory-event.consumer.ts
    apps/order-service/src/infrastructure/kafka/consumers/payment-event.consumer.ts
  </files>
  <action>
    In every Kafka consumer that handles events:
    1. Import the shared event topic constants from `@ecommerce/events`
    2. Replace dual-format case blocks like:
       ```typescript
       case 'OrderCreated':
       case 'order.created':
       ```
       With single format using the shared constant:
       ```typescript
       case ORDER_TOPICS.CREATED:  // 'order.created'
       ```
    3. Add Zod validation at the parse step:
       ```typescript
       const raw = JSON.parse(message.value.toString());
       const result = EventEnvelopeSchema.safeParse(raw);
       if (!result.success) {
         this.logger.warn(`Invalid event schema: ${result.error.message}`);
         return; // or send to DLQ
       }
       ```
    4. Update outbox writers in all services to use dot-notation event types (match the shared constants)
  </action>
  <verify>grep -rn "case 'Order" apps/*/src/ --include="*.ts" | grep -v "node_modules" | grep -v dist | wc -l</verify>
  <done>Zero PascalCase event type matches in case statements across all consumers</done>
</task>

## Success Criteria
- [ ] `packages/events` exports Zod schemas for all 8 domains
- [ ] Every event interface has `schemaVersion: number` field
- [ ] All Kafka consumers use shared topic constants (dot-notation only)
- [ ] Zero PascalCase event types in consumer switch/case blocks
- [ ] `pnpm -r build` passes
- [ ] `pnpm -r test` passes
