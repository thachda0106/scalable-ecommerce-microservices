---
phase: 16
plan: 7
wave: 4
---

# Plan 16.7: Documentation — Architecture, Events & Provider Docs

## Objective
Create comprehensive documentation for the payment-service covering the layered architecture, domain model, event contracts (published and consumed), and the payment provider abstraction with instructions for adding new providers.

## Context
- .gsd/phases/16/RESEARCH.md
- apps/payment-service/src/ (all layers from Plans 16.1–16.5)
- apps/notification-service/docs/ (reference doc patterns)
- apps/order-service/docs/ (reference doc patterns)

## Tasks

<task type="auto">
  <name>Create payment-service-architecture.md and README.md</name>
  <files>
    apps/payment-service/docs/payment-service-architecture.md [NEW]
    apps/payment-service/README.md [MODIFY]
    apps/payment-service/.env.example [NEW]
  </files>
  <action>
    1. **payment-service-architecture.md** — Comprehensive architecture document including:
       - Service overview and responsibility
       - Layered architecture diagram (mermaid) showing domain → application → infrastructure → interfaces
       - Domain model diagram (mermaid) showing Payment aggregate, VOs, events
       - Payment lifecycle state machine diagram (mermaid): PENDING → PROCESSING → SUCCESS → REFUNDED, PENDING|PROCESSING → FAILED
       - Provider strategy pattern diagram (mermaid)
       - Folder structure reference
       - DI binding map (ports → implementations)

    2. **README.md** — Replace NestJS boilerplate with production service README:
       - Service description and responsibilities
       - Quick start instructions (env vars, database, Kafka, run)
       - API endpoints table (POST /payments, GET /payments/:id, etc.)
       - Architecture overview with link to architecture doc
       - Testing instructions (`pnpm test`)
       - Environment variables reference

    3. **.env.example** — Documented environment variables:
       - DATABASE_URL (PostgreSQL connection)
       - KAFKA_BROKERS (comma-separated)
       - PORT (default 3004)
       - NODE_ENV (development/production)
       - DEFAULT_PAYMENT_PROVIDER (MOCK/STRIPE/PAYPAL)
       - PAYMENT_TIMEOUT_MS (default 30000)
       - MAX_RETRY_ATTEMPTS (default 3)
  </action>
  <verify>test -f apps/payment-service/docs/payment-service-architecture.md && test -f apps/payment-service/.env.example</verify>
  <done>
    - Architecture doc with 4+ mermaid diagrams
    - README replaced with production content (not NestJS boilerplate)
    - .env.example with 7+ documented variables
  </done>
</task>

<task type="auto">
  <name>Create payment-service-events.md and payment-service-providers.md</name>
  <files>
    apps/payment-service/docs/payment-service-events.md [NEW]
    apps/payment-service/docs/payment-service-providers.md [NEW]
  </files>
  <action>
    1. **payment-service-events.md** — Event contract documentation:
       - Consumed events table: topic, event type, payload schema, source service
         - `payment.commands` → ProcessPayment (from order-service): { orderId, amountInCents, currency, userId }
       - Published events table: topic, event type, payload schema, consumer services
         - `payment.events` → PaymentProcessed: { orderId, paymentId, transactionId, success: true }
         - `payment.events` → PaymentFailed: { orderId, paymentId, success: false, reason }
       - Event flow diagram (mermaid): order-service → payment.commands → payment-service → payment.events → order-service
       - Outbox pattern explanation with diagram
       - Idempotency and deduplication strategy
       - DLQ routing (payment.commands.dlq)

    2. **payment-service-providers.md** — Provider abstraction documentation:
       - Provider strategy pattern explanation
       - IPaymentProvider interface contract
       - Supported providers (Stripe, PayPal, Mock) with descriptions
       - How to add a new provider (step-by-step):
         1. Implement IPaymentProvider interface
         2. Register in PaymentProviderFactory
         3. Add to PaymentProviderEnum
         4. Configure via environment variables
       - Provider timeout and retry behavior
       - Testing with MockProvider

    **Anti-patterns to avoid:**
    - Do NOT invent endpoints, statuses, or events not in actual code
    - Do NOT skip mermaid diagrams — they are essential for developer onboarding
  </action>
  <verify>test -f apps/payment-service/docs/payment-service-events.md && test -f apps/payment-service/docs/payment-service-providers.md</verify>
  <done>
    - Events doc covers all consumed and published events with schemas
    - Providers doc includes step-by-step guide for adding new providers
    - Both docs include mermaid diagrams
    - All content matches actual codebase (no invented features)
  </done>
</task>

## Success Criteria
- [ ] docs/ folder contains 3 documentation files
- [ ] README.md is production-grade (not NestJS boilerplate)
- [ ] .env.example has 7+ documented variables
- [ ] All docs accurately reflect actual codebase
- [ ] 4+ mermaid diagrams across all docs
