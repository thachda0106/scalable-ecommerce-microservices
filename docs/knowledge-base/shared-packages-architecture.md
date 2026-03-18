# Shared Packages Architecture (`packages/`)

This document provides an in-depth review of the `packages` directory in the `scalable-ecommerce-microservices` project. It covers the theoretical foundation of using shared packages in a microservices architecture and details how these theories are implemented in code.

---

## 1. Theory: Why Use Shared Packages?

In a Microservices architecture, one of the biggest challenges is maintaining consistency across distributed boundaries without introducing tight coupling. If every microservice writes its own logging logic, event schema, or security interceptors, the system quickly degrades into a fragmented state.

The `packages` directory acts as a **Monorepo Shared Library Suite**. This approach solves several key problems:

1.  **DRY (Don't Repeat Yourself)**: Infrastructure code, such as Kafka consumers, Dead Letter Queue (DLQ) logic, and security header validation, only needs to be written and tested once.
2.  **Contract Enforcement**: Microservices communicate asynchronously via an Event Broker (e.g., Kafka). By sharing an `events` package, we ensure that the *Producer* and the *Consumer* agree on the exact shape of the data at compile time.
3.  **Consistent Observability**: All services emit logs, metrics, and distributed traces in the exact same format, making centralized debugging via tools like ELK or Prometheus/Grafana significantly easier.

---

## 2. Directory Structure

The project currently divides shared code into three primary packages:

1.  **`@ecommerce/core`**: Cross-cutting infrastructure concerns (Observability, Security, Persistence, Kafka).
2.  **`@ecommerce/events`**: Strongly-typed and validated Event schemas used across the message broker.
3.  **`@ecommerce/shared-types`**: Standardized HTTP API structures (Pagination, API Responses).

---

## 3. Deep Dive into `@ecommerce/core`

The core package handles the heavy lifting of backend infrastructure. Services import these modules to guarantee they are abiding by the system's architectural standards.

### 3.1 Persistence & The Transactional Outbox
**File:** `packages/core/src/persistence/unit-of-work.ts`

**Theory:** In distributed systems, saving data to a database and publishing an event to a broker (like Kafka) are two separate operations. If the database commit succeeds but the event publisher fails (or vice versa), the system enters an inconsistent state. The **Transactional Outbox Pattern** solves this by saving the business entity *and* the event to the same database within a single transaction.

**Implementation:**
The `UnitOfWork` class forces services to execute business logic inside a transactional `EntityManager`. It automatically takes generated `IDomainEvent`s, wraps them in an `OutboxEventEntity`, and saves them alongside the main entity updates.
```typescript
await this.dataSource.transaction(async (manager) => {
  const result = await work(manager); // e.g., save Order
  if (events.length > 0) {
    // Write domain events to outbox within the same transaction
    await manager.save(OutboxEventEntity, outboxEntries);
  }
  return result;
});
```
A secondary background process (a relay/CDC) will then safely read from this outbox table and publish to Kafka ensuring *At-Least-Once Delivery*.

### 3.2 Security & Internal Auth (Zero-Trust Service to Service)
**File:** `packages/core/src/security/internal-auth.ts`

**Theory:** Just because a microservice is inside a private network doesn't mean it should trust all incoming requests implicitly. We need a way to verify that a request genuinely came from the API Gateway and hasn't been spoofed.

**Implementation:**
The project uses **HMAC (Hash-based Message Authentication Code)** to sign headers. 
1.  The API Gateway signs the user's ID and roles using a shared `INTERNAL_AUTH_SECRET`.
2.  It appends headers: `x-user-id`, `x-internal-timestamp`, and `x-internal-signature`.
3.  Downstream microservices use `verifyInternalHeaders()` from this package. This function checks the timestamp (for replay attack protection, bounded to a 5-minute tolerance window) and uses `timingSafeEqual` to verify the HMAC signature matches.

### 3.3 Kafka & Dead Letter Queues (DLQ)
**File:** `packages/core/src/kafka/dlq-producer.ts`

**Theory:** When an Event Consumer fails to process a message (e.g., because of a bug or database constraint), it shouldn't just drop the message or block the queue forever. Failed messages should be routed to a Dead Letter Queue for manual inspection or later reprocessing.

**Implementation:**
The `KafkaDlqProducer` wraps a standard Kafka producer and appends`.dlq` to the original topic. It injects vital diagnostic metadata into the headers:
*   `x-dlq-reason`: The error message.
*   `x-dlq-timestamp`: When the failure occurred.
*   `x-dlq-original-topic`: Where the message originally came from.

---

## 4. Deep Dive into `@ecommerce/events`

**File:** `packages/events/src/envelope.ts`

**Theory:** An Event-Driven Architecture (EDA) requires strict contracts. If a Producer changes an event schema, Consumers will break. By defining standard envelopes and schemas in a central package, we rely on TypeScript and Zod to enforce compatibility.

**Implementation:**
This package utilizes `zod` to create an `EventEnvelopeSchema`. Every domain event emitted in the system must conform to this Base Envelope:
```typescript
export const EventEnvelopeSchema = z.object({
  type: z.string(),
  schemaVersion: z.number().int().positive(),
  source: z.string(), // Which microservice emitted this
  correlationId: z.string().uuid().optional(), // For distributed tracing
  timestamp: z.string().datetime(),
  payload: z.record(z.unknown()), // The specific event data
});
```
Other files in this package (e.g., `order.events.ts`, `inventory.events.ts`) define the specific shapes of the `payload` for each respective domain, guaranteeing data integrity across service bounds.

---

## 5. Deep Dive into `@ecommerce/shared-types`

**Files:** `packages/shared-types/src/api-response.ts`, `pagination.ts`

**Theory:** API Consumers (Frontend, Mobile) expect API responses to have a predictable structure. If `UserService` returns `{ user: {} }` but `ProductService` returns `{ data: {}, meta: {} }`, the frontend code becomes complex and error-prone.

**Implementation:**
The `shared-types` package exposes global utility types and generic DTOs.
For instance, the definitions in `api-response.ts` ensure that whether an endpoint succeeds or fails, it conforms to a globally established wrapper object across all microservices.

---

## Summary Summary
The `packages` directory in this project embodies the philosophy of **"Build once, use everywhere safely."** By isolating complex infrastructure logic (Outbox, HMAC Auth, DLQ) and strict Data Contracts (Zod Events) into shared libraries, the individual microservices remain lightweight, focused purely on domain business logic, and resilient to failure.
