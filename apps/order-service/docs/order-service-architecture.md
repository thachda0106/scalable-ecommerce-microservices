# Order Service Architecture

## Overview

The Order Service is a production-grade NestJS microservice built with **DDD + Clean Architecture**, **CQRS**, **Event-Driven Architecture**, and the **Saga pattern**. It manages the complete order lifecycle in a distributed ecommerce system.

## Layer Architecture

```
┌──────────────────────────────────────────────────────┐
│                  Interface Layer                      │
│  Controllers │ DTOs │ Filters │ Module Wiring         │
├──────────────────────────────────────────────────────┤
│                Application Layer                      │
│  Commands │ Queries │ Handlers │ Ports                 │
├──────────────────────────────────────────────────────┤
│                  Domain Layer                         │
│  Entities │ Value Objects │ Events │ Errors │ Ports    │
├──────────────────────────────────────────────────────┤
│               Infrastructure Layer                    │
│  Persistence │ Kafka │ External Services │ Observability│
└──────────────────────────────────────────────────────┘
```

### Dependency Rule
- Domain → (no imports from other layers)
- Application → Domain
- Infrastructure → Domain, Application
- Interface → Application

### Zero Framework Coupling in Domain
The `domain/` layer has **zero `@nestjs` imports**. It is pure TypeScript, fully testable without any framework bootstrap.

## Directory Structure

```
src/
├── domain/                          # Pure business logic
│   ├── entities/                    # Order (aggregate root), OrderItem
│   ├── value-objects/               # OrderId, UserId, Money, OrderStatus
│   ├── events/                      # 8 domain events + base class
│   ├── errors/                      # DomainException hierarchy
│   └── ports/                       # IOrderRepository, IProcessedEventRepository
├── application/                     # Use case orchestration
│   ├── commands/                    # 6 command DTOs
│   ├── queries/                     # 2 query DTOs
│   ├── handlers/                    # 8 handlers (6 command + 2 query)
│   └── ports/                       # IEventPublisher, IInventoryService, IPaymentService
├── infrastructure/                  # Technical implementations
│   ├── persistence/
│   │   ├── entities/                # TypeORM ORM entities
│   │   ├── mappers/                 # Domain ↔ ORM mappers
│   │   └── repositories/           # Port implementations
│   ├── kafka/
│   │   ├── consumers/               # Payment & Inventory event consumers
│   │   ├── saga/                    # CheckoutSagaOrchestrator
│   │   ├── kafka-event-publisher.ts # Outbox-based event publishing
│   │   └── outbox-relay.service.ts  # Polls outbox → Kafka
│   ├── external-services/           # Kafka command publishers
│   └── observability/               # Prometheus metrics
└── interfaces/                      # HTTP interface
    ├── controllers/                 # OrderController, HealthController
    ├── dto/                         # Request validation DTOs
    ├── filters/                     # DomainExceptionFilter
    └── order.module.ts              # Module wiring
```

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Aggregate pattern | Private fields + static factories | Explicit control, matches inventory-service |
| Injection tokens | `Symbol()` | Collision-free, matches established convention |
| Money representation | Integer cents (domain) ↔ decimal (DB) | Avoids floating-point precision issues |
| Event publishing | Transactional outbox | Exactly-once semantics |
| Idempotency | `processed_events` table | Proven pattern from inventory-service |
| Saga state | Implicit via Order status | Simpler than external saga state table |
| CQRS dispatch | Direct handler injection | Less NestJS coupling than CommandBus |
