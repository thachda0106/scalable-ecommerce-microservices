---
phase: 16
plan: 2
wave: 1
---

# Plan 16.2: Application Layer — Commands, Queries, Handlers & Ports

## Objective
Build the application layer implementing CQRS pattern with commands (ProcessPayment, RefundPayment), queries (GetPaymentById, GetPaymentsByOrder), their handlers, and external service port interfaces (event publisher). Handlers orchestrate domain aggregate + repository + event publishing.

## Context
- .gsd/phases/16/RESEARCH.md
- apps/payment-service/src/domain/ (built in Plan 16.1)
- apps/order-service/src/application/ (reference patterns)
- apps/order-service/src/infrastructure/external-services/kafka-payment.service.ts (contract: orderId, amountInCents, currency, userId)

## Tasks

<task type="auto">
  <name>Create commands, queries, and application ports</name>
  <files>
    apps/payment-service/src/application/commands/process-payment.command.ts [NEW]
    apps/payment-service/src/application/commands/refund-payment.command.ts [NEW]
    apps/payment-service/src/application/commands/index.ts [NEW]
    apps/payment-service/src/application/queries/get-payment-by-id.query.ts [NEW]
    apps/payment-service/src/application/queries/get-payments-by-order.query.ts [NEW]
    apps/payment-service/src/application/queries/index.ts [NEW]
    apps/payment-service/src/application/ports/event-publisher.port.ts [NEW]
    apps/payment-service/src/application/ports/payment-provider-factory.port.ts [NEW]
    apps/payment-service/src/application/ports/index.ts [NEW]
  </files>
  <action>
    1. **ProcessPaymentCommand** — fields: orderId (string), userId (string), amountInCents (number), currency (string), provider (string, optional, defaults to configured provider), idempotencyKey (string, optional)
       - This matches the contract from order-service's KafkaPaymentService: `{ orderId, amountInCents, currency, userId }`

    2. **RefundPaymentCommand** — fields: paymentId (string), reason (string)

    3. **GetPaymentByIdQuery** — fields: paymentId (string)
    4. **GetPaymentsByOrderQuery** — fields: orderId (string)

    5. **IEventPublisher port** (Symbol EVENT_PUBLISHER): publish(event), publishAll(events) — same as order-service pattern

    6. **IPaymentProviderFactory port** (Symbol PAYMENT_PROVIDER_FACTORY): getProvider(providerName: PaymentProviderEnum) → IPaymentProvider. Factory is a port because domain defines the interface but infrastructure implements the selection logic.

    **Anti-patterns to avoid:**
    - Commands/queries are plain DTOs — no business logic
    - Do NOT import @nestjs/cqrs decorators here — keep as plain classes (handler registration in module)
  </action>
  <verify>npx tsc --noEmit --project apps/payment-service/tsconfig.json</verify>
  <done>
    - 2 command DTOs, 2 query DTOs created
    - 2 application ports with Symbol tokens
    - All match expected contract from order-service
  </done>
</task>

<task type="auto">
  <name>Create command and query handlers</name>
  <files>
    apps/payment-service/src/application/handlers/process-payment.handler.ts [NEW]
    apps/payment-service/src/application/handlers/refund-payment.handler.ts [NEW]
    apps/payment-service/src/application/handlers/get-payment-by-id.handler.ts [NEW]
    apps/payment-service/src/application/handlers/get-payments-by-order.handler.ts [NEW]
    apps/payment-service/src/application/handlers/index.ts [NEW]
  </files>
  <action>
    1. **ProcessPaymentHandler**:
       - Inject: IPaymentRepository, IPaymentProviderFactory, IEventPublisher via Symbol tokens
       - Flow:
         a. Check idempotency: if idempotencyKey provided, check repository.findByIdempotencyKey(). If exists with SUCCESS status, return existing payment (idempotent).
         b. Create Payment aggregate via `Payment.create({ orderId, userId, amountInCents, currency, provider, idempotencyKey })`
         c. Save PENDING payment to repository
         d. Get provider from factory: `providerFactory.getProvider(provider)`
         e. Call `payment.startProcessing()`, save again
         f. Call `provider.processPayment({ paymentId, orderId, amountInCents, currency })`
         g. On success: `payment.complete(result.transactionId)`, save
         h. On failure: `payment.fail(error.message)`, save
         i. Publish all domain events via eventPublisher.publishAll(payment.pullDomainEvents())
       - Wrap provider call in try/catch — if timeout or provider error, fail the payment

    2. **RefundPaymentHandler**:
       - Inject: IPaymentRepository, IPaymentProviderFactory, IEventPublisher
       - Flow:
         a. Find payment by ID, throw if not found
         b. Get provider, call provider.refundPayment(transactionId, amount)
         c. Call `payment.refund(reason)`, save
         d. Publish domain events

    3. **GetPaymentByIdHandler**:
       - Inject: IPaymentRepository
       - Find by ID, return payment.toJSON() or null

    4. **GetPaymentsByOrderHandler**:
       - Inject: IPaymentRepository
       - Find by orderId, return payments.map(p => p.toJSON())

    **Anti-patterns to avoid:**
    - Do NOT put business logic in handlers — delegate to aggregate behavior methods
    - Do NOT catch and swallow errors silently — let them propagate or log + rethrow
    - Do NOT directly import infrastructure — use port interfaces via DI
  </action>
  <verify>npx tsc --noEmit --project apps/payment-service/tsconfig.json</verify>
  <done>
    - ProcessPaymentHandler orchestrates: idempotency check → create → process → complete/fail → publish
    - RefundPaymentHandler orchestrates: find → refund → publish
    - 2 query handlers return domain DTOs
    - All handlers use DI via Symbol-based ports
  </done>
</task>

## Success Criteria
- [ ] `npx tsc --noEmit` passes for payment-service
- [ ] ProcessPaymentHandler includes idempotency check before creating payment
- [ ] All handlers inject dependencies via Symbol-based port tokens
- [ ] Command/query DTOs match order-service's ProcessPayment contract (orderId, amountInCents, currency, userId)
