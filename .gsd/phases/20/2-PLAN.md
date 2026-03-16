---
phase: 20
plan: 2
wave: 1
---

# Plan 20.2: Atomic Outbox — Shared UnitOfWork Pattern

## Objective
Fix non-atomic DB+event publishing by creating a shared `UnitOfWork` utility in `packages/core` and adopting it in services that currently save entities and outbox rows in separate transactions. The user-service already has this pattern — extract and generalize it.

## Context
- .gsd/phases/20/RESEARCH.md (Wave 1: Outbox Transaction Atomicity)
- apps/user-service/src/infrastructure/persistence/unit-of-work.service.ts (reference implementation)
- apps/order-service/src/infrastructure/kafka/kafka-event-publisher.ts (non-atomic)
- apps/product-service/src/infrastructure/kafka/kafka-event-publisher.ts (non-atomic)
- apps/payment-service/src/infrastructure/kafka/kafka-event-publisher.ts (non-atomic)

## Tasks

<task type="auto">
  <name>Extract UnitOfWork into packages/core</name>
  <files>
    packages/core/src/persistence/unit-of-work.ts (NEW)
    packages/core/src/persistence/outbox-event.entity.ts (NEW)
    packages/core/src/index.ts (MODIFY)
  </files>
  <action>
    Create `packages/core/src/persistence/unit-of-work.ts`:

    - Accept `DataSource` via constructor injection
    - Provide `execute<T>(work: (manager: EntityManager) => Promise<T>, events: BaseDomainEvent[]): Promise<T>`
    - Inside a single `dataSource.transaction()`:
      1. Execute the `work` callback (entity saves)
      2. Map events to outbox entries and save them via the same `EntityManager`
    - Export a standardized `OutboxEventEntity` base class in `outbox-event.entity.ts`

    Model after user-service `UnitOfWork` but make it generic (no service-specific entity imports).

    Export from `packages/core/src/index.ts`.

    Add `typeorm` as a peer dependency in `packages/core/package.json`.
  </action>
  <verify>grep -n "UnitOfWork" packages/core/src/index.ts</verify>
  <done>UnitOfWork exported from @ecommerce/core</done>
</task>

<task type="auto">
  <name>Adopt UnitOfWork in order-service and product-service</name>
  <files>
    apps/order-service/src/infrastructure/kafka/kafka-event-publisher.ts (MODIFY)
    apps/order-service/src/application/handlers/create-order.handler.ts (MODIFY)
    apps/product-service/src/infrastructure/kafka/kafka-event-publisher.ts (MODIFY)
    apps/product-service/src/application/handlers/create-product.handler.ts (MODIFY)
  </files>
  <action>
    In each service's command handlers:
    1. Inject the `UnitOfWork` (from `@ecommerce/core`) instead of separate repo + publisher
    2. Replace the pattern:
       ```
       await repo.save(entity);
       await publisher.publishAll(events);
       ```
       With:
       ```
       await unitOfWork.execute(
         (manager) => manager.save(OrmEntity, mapped),
         entity.pullDomainEvents(),
       );
       ```
    3. The `KafkaEventPublisher.publishAll()` method should be simplified to only write to outbox (it already does this, but remove its own transaction wrapper since UnitOfWork handles it).

    Apply to: create-order handler, confirm-payment handler, cancel-order handler, create-product handler, update-product handler, delete-product handler.

    Do NOT break existing `OutboxRelayService` — it still polls and publishes from outbox.
  </action>
  <verify>cd apps/order-service && npx tsc --noEmit && cd ../product-service && npx tsc --noEmit</verify>
  <done>Both services compile without errors; handler tests still pass</done>
</task>

## Success Criteria
- [ ] `UnitOfWork` class exported from `@ecommerce/core`
- [ ] order-service handlers use `UnitOfWork` for atomic save+outbox
- [ ] product-service handlers use `UnitOfWork` for atomic save+outbox
- [ ] `pnpm -r build` passes
- [ ] Existing unit tests pass (`pnpm -r test`)
