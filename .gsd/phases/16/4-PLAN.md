---
phase: 16
plan: 4
wave: 2
---

# Plan 16.4: Interface Layer — Controller, DTOs, Module Wiring

## Objective
Build the interface layer with thin PaymentController, validated DTOs, NestJS module wiring, and updated AppModule. Wire all DI bindings between domain ports, application ports, and infrastructure implementations.

## Context
- .gsd/phases/16/RESEARCH.md
- apps/payment-service/src/domain/ (Plan 16.1)
- apps/payment-service/src/application/ (Plan 16.2)
- apps/payment-service/src/infrastructure/ (Plan 16.3)
- apps/order-service/src/interfaces/ (reference patterns)
- apps/payment-service/package.json (need to add @nestjs/cqrs, class-validator, class-transformer)

## Tasks

<task type="auto">
  <name>Install new dependencies and create DTOs with validation</name>
  <files>
    apps/payment-service/package.json [MODIFY]
    apps/payment-service/src/interfaces/dto/process-payment.dto.ts [NEW]
    apps/payment-service/src/interfaces/dto/refund-payment.dto.ts [NEW]
    apps/payment-service/src/interfaces/dto/payment-response.dto.ts [NEW]
    apps/payment-service/src/interfaces/dto/index.ts [NEW]
  </files>
  <action>
    1. **Install dependencies**: Run `pnpm add @nestjs/cqrs class-validator class-transformer` in payment-service directory.

    2. **ProcessPaymentDto** — class-validator decorated: orderId (IsString, IsNotEmpty), userId (IsString, IsNotEmpty), amountInCents (IsInt, Min(1)), currency (IsString, default 'USD'), provider (IsOptional, IsEnum(PaymentProviderEnum)), idempotencyKey (IsOptional, IsString)

    3. **RefundPaymentDto** — paymentId (IsString, IsNotEmpty), reason (IsString, IsNotEmpty)

    4. **PaymentResponseDto** — id, orderId, userId, amountInCents, currency, status, provider, transactionId, createdAt. No validation needed (output only).

    **Anti-patterns to avoid:**
    - Do NOT put business logic in DTOs
    - Do NOT skip validation — all input must be validated
  </action>
  <verify>npx tsc --noEmit --project apps/payment-service/tsconfig.json</verify>
  <done>
    - @nestjs/cqrs, class-validator, class-transformer installed
    - 3 DTO classes with class-validator decorators
    - All input fields validated
  </done>
</task>

<task type="auto">
  <name>Create PaymentController, PaymentModule, and update AppModule</name>
  <files>
    apps/payment-service/src/interfaces/controllers/payment.controller.ts [NEW]
    apps/payment-service/src/interfaces/controllers/index.ts [NEW]
    apps/payment-service/src/interfaces/filters/domain-exception.filter.ts [NEW]
    apps/payment-service/src/payment.module.ts [NEW]
    apps/payment-service/src/app.module.ts [MODIFY]
    apps/payment-service/src/app.controller.ts [MODIFY]
    apps/payment-service/src/main.ts [MODIFY]
  </files>
  <action>
    1. **PaymentController**:
       - POST /payments — accepts ProcessPaymentDto, creates ProcessPaymentCommand, delegates to handler, returns PaymentResponseDto
       - POST /payments/:id/refund — accepts RefundPaymentDto, creates RefundPaymentCommand, delegates to handler
       - GET /payments/:id — creates GetPaymentByIdQuery, delegates to handler
       - GET /payments/order/:orderId — creates GetPaymentsByOrderQuery, delegates to handler
       - Controller is THIN — no business logic, only maps DTOs to commands/queries

    2. **DomainExceptionFilter** — Catches domain exceptions (InvalidPaymentStatusTransitionError, InvalidPaymentOperationError) and returns appropriate HTTP status codes (400 for validation, 409 for conflict, 404 for not found).

    3. **PaymentModule** — NestJS module wiring all components together:
       - Imports: TypeOrmModule.forFeature([PaymentOrmEntity, OutboxEventOrmEntity, ProcessedEventOrmEntity]), CqrsModule, ScheduleModule
       - Providers: All handlers, all infrastructure implementations bound to their port tokens:
         - { provide: PAYMENT_REPOSITORY, useClass: TypeOrmPaymentRepository }
         - { provide: EVENT_PUBLISHER, useClass: KafkaEventPublisher }
         - { provide: PAYMENT_PROVIDER_FACTORY, useClass: PaymentProviderFactory }
         - All 3 provider implementations (StripeProvider, PayPalProvider, MockProvider)
         - PaymentCommandConsumer, OutboxRelayService, KafkaClientFactory
       - Controllers: PaymentController

    4. **Update AppModule** — Remove old PaymentModule, ConsumerModule, OutboxModule imports. Import new PaymentModule. Keep getLoggerModule(), ScheduleModule.forRoot(), TypeOrmModule.forRoot() with updated entity list.

    5. **Update AppController** — Keep health endpoint only, remove getHello() boilerplate.

    6. **Update main.ts** — Add ValidationPipe with class-validator (transform: true, whitelist: true).

    **Delete old files** (after new code is in place):
    - apps/payment-service/src/payment/ (old flat module)
    - apps/payment-service/src/consumer/ (old consumer)
    - apps/payment-service/src/outbox/ (moved to infrastructure/)
    - apps/payment-service/src/app.service.ts (boilerplate)
    - apps/payment-service/src/app.controller.spec.ts (boilerplate test)

    **Anti-patterns to avoid:**
    - Do NOT put business logic in controller — only DTO→Command mapping
    - Do NOT import domain entities directly in controller — use response DTOs
    - Do NOT leave old flat modules in place — clean delete
  </action>
  <verify>npx tsc --noEmit --project apps/payment-service/tsconfig.json</verify>
  <done>
    - PaymentController with 4 endpoints delegating to handlers
    - PaymentModule wires all DI bindings (ports → implementations)
    - AppModule updated with new module structure
    - Old flat modules deleted
    - ValidationPipe configured in main.ts
  </done>
</task>

## Success Criteria
- [ ] `npx tsc --noEmit` passes for payment-service
- [ ] PaymentController delegates to handlers — no business logic in controller
- [ ] All DI bindings use Symbol-based port tokens
- [ ] Old flat modules (payment/, consumer/, outbox/) deleted
- [ ] ValidationPipe active for all incoming requests
