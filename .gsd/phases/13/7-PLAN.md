---
phase: 13
plan: 7
wave: 3
---

# Plan 13.7: Interface Layer — Controller, DTOs, Filters & Module Wiring

## Objective
Create the thin interface layer — OrderController delegates to command/query handlers.
Wire all modules together with proper NestJS DI bindings.
Replace the old flat structure with the new layered architecture.

## Context
- .gsd/SPEC.md
- apps/order-service/src/orders/orders.controller.ts (current controller — will be replaced)
- apps/order-service/src/orders/orders.module.ts (current module — will be replaced)
- apps/order-service/src/app.module.ts (needs rewiring)
- apps/cart-service/src/interfaces/ (established pattern)
- apps/inventory-service/src/interfaces/ (established pattern)

## Tasks

<task type="auto">
  <name>Create DTOs and Controller</name>
  <files>
    apps/order-service/src/interfaces/dto/create-order.dto.ts
    apps/order-service/src/interfaces/dto/cancel-order.dto.ts
    apps/order-service/src/interfaces/dto/ship-order.dto.ts
    apps/order-service/src/interfaces/dto/order-response.dto.ts
    apps/order-service/src/interfaces/dto/index.ts
    apps/order-service/src/interfaces/controllers/order.controller.ts
    apps/order-service/src/interfaces/controllers/health.controller.ts
    apps/order-service/src/interfaces/controllers/index.ts
    apps/order-service/src/interfaces/filters/domain-exception.filter.ts
    apps/order-service/src/interfaces/filters/index.ts
  </files>
  <action>
    **DTOs with class-validator**:
    - CreateOrderDto: userId (@IsUUID), items[] (@IsArray, @ValidateNested with { productId, productName, quantity, unitPrice })
    - CancelOrderDto: reason (@IsString, @IsOptional)
    - ShipOrderDto: trackingNumber (@IsString)
    - OrderResponseDto: static `fromDomain(order: Order)` factory — flattens aggregate to JSON-safe response

    **OrderController** (thin — delegates ONLY to handlers):
    - `POST /orders` → CreateOrderHandler
    - `GET /orders/:id` → GetOrderByIdHandler
    - `GET /orders/user/:userId` → GetOrdersByUserHandler
    - `POST /orders/:id/cancel` → CancelOrderHandler
    - `POST /orders/:id/confirm-payment` → ConfirmPaymentHandler
    - `POST /orders/:id/ship` → ShipOrderHandler
    - `POST /orders/:id/deliver` → DeliverOrderHandler
    - `POST /orders/:id/refund` → RefundOrderHandler
    Controller uses @UsePipes(ValidationPipe) and @UseFilters(DomainExceptionFilter)

    **HealthController**: `GET /health` → { status: 'up', service: 'order-service' }

    **DomainExceptionFilter**: Catches DomainException → 400 Bad Request with error message.
    Catches InvalidOrderStatusTransitionError → 409 Conflict.
  </action>
  <verify>npx tsc --noEmit --project apps/order-service/tsconfig.json 2>&1 | head -20</verify>
  <done>4 DTOs with validation, OrderController with 8 endpoints delegating to CQRS handlers, HealthController, DomainExceptionFilter.</done>
</task>

<task type="auto">
  <name>Module Wiring and Old Code Removal</name>
  <files>
    apps/order-service/src/order.module.ts [NEW]
    apps/order-service/src/app.module.ts [MODIFY]
    apps/order-service/src/main.ts [MODIFY]
  </files>
  <action>
    **OrderModule** — central NestJS module wiring everything together:
    ```
    imports: [
      TypeOrmModule.forFeature([OrderOrmEntity, OrderItemOrmEntity, ProcessedEventOrmEntity, OutboxEventOrmEntity]),
    ]
    controllers: [OrderController, HealthController]
    providers: [
      // Command handlers
      CreateOrderHandler, ConfirmPaymentHandler, CancelOrderHandler,
      ShipOrderHandler, DeliverOrderHandler, RefundOrderHandler,
      // Query handlers
      GetOrderByIdHandler, GetOrdersByUserHandler,
      // Port bindings (infrastructure → domain port)
      { provide: ORDER_REPOSITORY, useClass: TypeOrmOrderRepository },
      { provide: PROCESSED_EVENT_REPOSITORY, useClass: TypeOrmProcessedEventRepository },
      { provide: EVENT_PUBLISHER, useClass: KafkaEventPublisher },
      { provide: INVENTORY_SERVICE, useClass: KafkaInventoryService },
      { provide: PAYMENT_SERVICE, useClass: KafkaPaymentService },
      // Infrastructure services
      OutboxRelayService, CheckoutSagaOrchestrator,
      PaymentEventConsumer, InventoryEventConsumer,
    ]
    ```

    **AppModule** — simplified:
    - Import OrderModule, ScheduleModule, TypeOrmModule.forRoot(), LoggerModule
    - Remove old OrdersModule, OutboxModule, SagasModule, AppController, AppService imports
    - TypeOrmModule.forRoot() uses the new ORM entities

    **main.ts** — add ValidationPipe globally, keep Logger setup

    **Delete old files** (no longer needed):
    - src/orders/ (entire directory)
    - src/outbox/ (entire directory — replaced by infrastructure/kafka/)
    - src/sagas/ (entire directory — replaced by infrastructure/kafka/saga/)
    - src/app.controller.ts (health endpoint moved to HealthController)
    - src/app.service.ts (unused)
    - src/app.controller.spec.ts (will be replaced by new tests)
  </action>
  <verify>npx tsc --noEmit --project apps/order-service/tsconfig.json 2>&1 | head -20</verify>
  <done>OrderModule wires all layers via DI with port→adapter bindings. AppModule simplified. Old flat structure removed.</done>
</task>

## Success Criteria
- [ ] OrderController delegates ONLY to command/query handlers (no business logic)
- [ ] DTOs have class-validator decorators
- [ ] DomainExceptionFilter maps domain errors to HTTP status codes
- [ ] OrderModule binds all port tokens to infrastructure implementations
- [ ] Old orders/, outbox/, sagas/ directories removed
- [ ] `npx tsc --noEmit` passes
- [ ] ValidationPipe configured globally
