# ROADMAP.md

> **Current Phase**: Phase 1
> **Milestone**: Architecture & Design Phase

## Phases

### Phase 1: Architecture & System Design
**Status**: ✅ Complete
**Objective**: Document the high-level system architecture, service boundaries, domain models, database schemas, Kafka event architecture, Saga flows, infrastructure design, observability, CI/CD, and failure recovery.

### Phase 2: Infrastructure as Code (Terraform)
**Status**: ✅ Complete
**Objective**: Write modular Terraform code to provision AWS VPC, ECS cluster, RDS instances, Redis, MSK (Kafka), OpenSearch, ALB, and baseline IAM/Monitoring.

### Phase 3: Foundation Services & API Gateway
**Status**: ✅ Complete
**Objective**: Scaffold the NestJS monorepo/polyrepo structure. Implement API Gateway, Auth Service, and User Service. Set up OpenTelemetry tracing, centralized logging, and Prometheus metrics across base services.

### Phase 4: Product Catalog & Search (CQRS)
**Status**: ✅ Complete
**Objective**: Implement Product Service and Search Service. Model the event-driven synchronization between Product (writers) and Search (readers via OpenSearch) using Kafka to handle 50M products.

### Phase 5: Transactional Core (Saga Pattern)
**Status**: ✅ Completed
**Objective**: Implement Cart, Order, Inventory, and Payment services. Orchestrate or choreograph the complex checkout Saga handling reservations, payments, and compensation logic to prevent over-selling and double charging.

### Phase 6: Notifications & CI/CD Finalization
**Status**: ✅ Completed
**Objective**: Implement Notification service for order updates. Finalize GitHub Actions/GitLab CI pipelines for automated testing, Docker build/push, and deployment to ECS.

---

### Phase 7: Production-Grade API Gateway
**Status**: ✅ Completed
**Objective**: Upgrade the existing API Gateway from a minimal health-check service into a fully production-ready API Gateway for the ecommerce microservices platform. Handle request routing, authentication, Redis rate limiting, observability, resilience patterns, standardized errors, and API aggregation.
**Depends on**: Phase 6

**Tasks**:
- [ ] TBD (run /plan 7 to populate implementation tasks)

**Verification**:
- TBD

---

### Phase 8: Production-Grade Auth & Identity Service
**Status**: ✅ Completed
**Objective**: Upgrade the Auth Service into a production-grade identity and authentication system, handling JWT access/refresh tokens, Redis-backed token rotation, role-based access control (RBAC), OAuth (Google/GitHub), identity management (registration, email verification, password reset), and security hardening. Publish Kafka events (`user.registered`, `user.logged_in`, etc.) for downstream consumption.
**Depends on**: Phase 7

**Tasks**:
- [ ] TBD (run /plan 8 to populate implementation tasks)

**Verification**:
- TBD

---

### Phase 9: API Gateway Production Hardening
**Status**: ✅ Completed
**Objective**: Upgrade the API Gateway into a scalable and resilient gateway layer responsible for request routing, JWT verification, rate limiting, request aggregation, resilience patterns, and distributed tracing.
**Depends on**: Phase 8

**Tasks**:
- [x] Task 1: Refactor API Gateway structure into a production-ready architecture.
- [x] Task 2: Implement JWT verification and identity extraction.
- [x] Task 3: Add Redis rate limiting protection (100 req/min/IP).
- [x] Task 4: Add request aggregation endpoints (`/cart-summary`, `/product-page/{id}`, `/order-details/{id}`).
- [x] Task 5: Add resilience patterns (request timeouts, retries, circuit breaker).
- [x] Task 6: Implement proxy routing rules for all microservices.
- [x] Task 7: Add distributed request tracing (`x-request-id`).
- [x] Task 8: Generate `docs/api-gateway-architecture.md` detailing architecture, request flow, and patterns.

**Verification**:
- TBD

---

### Phase 10: Production-Grade Cart Service
**Status**: ✅ Completed
**Objective**: Transform the cart-service from a basic 3-file implementation into a production-grade microservice following DDD, Clean Architecture, CQRS, Redis caching, Kafka event publishing, external service integration, DTO validation, idempotency, unit tests, and architecture documentation.
**Depends on**: Phase 9

**Tasks**:
- [ ] Task 1: Domain layer — Cart aggregate, CartItem entity, ProductId/Quantity VOs, domain events
- [ ] Task 2: CQRS — Commands (AddItem, RemoveItem, ClearCart), Query (GetCart), port interfaces, handlers
- [ ] Task 3: Infrastructure — Redis cache adapter, Kafka producer, in-memory repository, HTTP clients
- [ ] Task 4: Interfaces — DTOs with class-validator, thin CartController, CartModule wiring, AppModule update
- [ ] Task 5: Tests — Domain unit tests, AddItemHandler tests, GetCartHandler tests
- [ ] Task 6: Docs — `docs/cart-service-architecture.md` with domain model, flows, cache and event architecture

**Verification**:
- `pnpm test` passes in cart-service
- `npx tsc --noEmit` shows zero errors
- No `@nestjs` import in any file under `src/domain/`
- `CartController` delegates only to CommandBus/QueryBus

---

### Phase 11: Production-Grade Inventory Service
**Status**: ⬜ Not Started
**Objective**: Full redesign and production hardening of the inventory-service. Transform it from a basic scaffold into an Amazon/Shopify-caliber system supporting millions of users, high concurrency, and zero overselling. Implements DDD domain model (ProductInventory, StockReservation, StockMovement), CQRS, three-layer concurrency control (Redis lock + OCC + DB transactions), hybrid PostgreSQL+Redis storage, cart/order integration via Kafka events, REST API with idempotency, reservation TTL expiry, observability (Prometheus + OpenTelemetry), security, and production hardening.
**Depends on**: Phase 10

**Tasks**:
- [ ] Wave 1: Domain layer — ProductInventory aggregate, StockReservation, StockMovement, VOs, domain events, ports
- [ ] Wave 2: Application layer — CQRS commands (Reserve, Release, Confirm, Replenish), query (GetInventory), handlers
- [ ] Wave 3: Infrastructure — TypeORM entities/mappers/repo, Redis cache + lock, Kafka publisher + consumers, outbox relay, expiry worker, retry/circuit breaker, config
- [ ] Wave 4: Interface layer — DTOs, InventoryController, service auth guard, health checks, Prometheus metrics, module wiring
- [ ] Wave 5: Tests & docs — Domain unit tests, handler tests, tsc --noEmit, architecture documentation

**Verification**:
- `pnpm test` passes in inventory-service
- `npx tsc --noEmit` shows zero errors
- No `@nestjs` import in any file under `src/domain/`
- `InventoryController` delegates only to CommandBus/QueryBus
- All stock mutations use `UPDATE ... WHERE version = X AND available >= qty`
- Redis distributed lock on write path
- Idempotency keys on all mutation endpoints

---

### Phase 12: Production-Grade Notification Service
**Status**: ✅ Complete
**Objective**: Full redesign and production hardening of the notification-service. Transform it from a minimal 2-module scaffold (mock email, single Kafka consumer on `order.events`) into a production-grade, multi-channel notification platform following DDD, Clean Architecture, and event-driven microservices patterns. Implements domain model (Notification, NotificationChannel, NotificationTemplate), CQRS use cases (SendEmailNotification, SendPushNotification, SendSmsNotification, SendInAppNotification), multi-channel provider integrations (SendGrid, Twilio, Firebase), a variable-based template system, Kafka consumer handlers for domain events (user.registered, order.created, order.paid, order.shipped, cart.abandoned), retry with exponential backoff and DLQ, and observability (Prometheus metrics, structured logging, OpenTelemetry tracing).
**Depends on**: Phase 11

**Tasks**:
- [ ] Wave 1: Domain layer — Notification aggregate, NotificationChannel enum (EMAIL, SMS, PUSH, IN_APP), NotificationTemplate entity, NotificationStatus value object, domain events (NotificationSent, NotificationFailed), port interfaces (NotificationRepository, TemplateRepository, ChannelProvider)
- [ ] Wave 2: Application layer — CQRS commands (SendEmailNotification, SendPushNotification, SendSmsNotification, SendInAppNotification), event handlers for Kafka events (UserRegisteredHandler, OrderCreatedHandler, OrderPaidHandler, OrderShippedHandler, CartAbandonedHandler), NotificationOrchestrator use case
- [ ] Wave 3: Infrastructure — Kafka consumer setup (multi-topic: user.events, order.events, cart.events), provider integrations (SendGridEmailProvider, TwilioSmsProvider, FirebasePushProvider), template engine with variable interpolation ({{userName}}, {{orderId}}), notification repository (in-memory/TypeORM)
- [ ] Wave 4: Interface layer — NotificationController (health, status, resend), DTOs with class-validator, retry strategy (exponential backoff, max 3 retries), Dead Letter Queue (DLQ) for failed notifications, Prometheus metrics (notification_sent_total, notification_failed_total, notification_retry_total), module wiring
- [ ] Wave 5: Tests — Domain unit tests, handler tests, provider mock tests, template rendering tests, `tsc --noEmit`
- [ ] Wave 6: Documentation — `notification-service-architecture.md` (layered architecture, domain model, provider abstraction), `notification-service-events.md` (consumed events, event-to-notification mapping), `notification-service-flow.md` (end-to-end notification flow with retry/DLQ)

**Verification**:
- `pnpm test` passes in notification-service
- `npx tsc --noEmit` shows zero errors
- No `@nestjs` import in any file under `src/domain/`
- `NotificationController` delegates only to CommandBus/QueryBus
- All 5 Kafka event types consumed and mapped to appropriate notifications
- Template variables correctly interpolated
- Retry logic with exponential backoff (max 3 retries) and DLQ routing
- Prometheus metrics exposed at `/metrics`

---

### Phase 13: Production-Grade Order Service
**Status**: ✅ Complete
**Objective**: Full redesign and production hardening of the order-service. Transform it from a basic scaffold into a production-grade microservice following DDD, Clean Architecture, CQRS, and event-driven patterns. Implements Order aggregate (Order, OrderItem entities; OrderId, UserId, Money, OrderStatus value objects), complete order lifecycle (CREATED → PENDING_PAYMENT → PAID → CONFIRMED → SHIPPED → DELIVERED → CANCELLED → REFUNDED), Saga orchestration for distributed transactions across payment/inventory/cart/notification services, Kafka producers and consumers for order domain events, idempotent event handling with processed_events tracking, database design with indexing strategy, observability (structured logging, Prometheus metrics, OpenTelemetry tracing), and scalability patterns (Kafka partitioning, consumer groups, horizontal scaling, caching).
**Depends on**: Phase 12

**Tasks**:
- [ ] Wave 1: Analyze current order-service — document existing behavior, communication patterns, event handling, and design problems
- [ ] Wave 2: Domain layer — Order aggregate root, OrderItem entity, OrderId/UserId/Money/OrderStatus value objects, domain events (OrderCreated, OrderPaidEvent, OrderCancelledEvent, OrderShippedEvent, OrderCompletedEvent), domain services, repository ports
- [ ] Wave 3: Application layer — CQRS commands (CreateOrder, ConfirmPayment, CancelOrder, ShipOrder), queries (GetOrderById, GetOrdersByUser), command/query handlers orchestrating domain + repos + events
- [ ] Wave 4: Infrastructure layer — TypeORM entities/repos/mappers, Kafka producers (OrderCreated, OrderPaid, OrderCancelled), Kafka consumers (PaymentCompleted, PaymentFailed, InventoryReserved, InventoryFailed), Saga orchestrator (CreateOrder → ReserveInventory → RequestPayment → ConfirmOrder with compensation), processed_events table for idempotency, external service clients
- [ ] Wave 5: Interface layer — DTOs with class-validator, thin OrderController, Kafka consumer handlers, module wiring, AppModule update
- [ ] Wave 6: Database design — orders/order_items tables, indexing strategy (user_id, status, created_at), migration scripts
- [ ] Wave 7: Observability & production hardening — structured logging, Prometheus metrics (orders_created, orders_cancelled, payment_failures, order_processing_latency), OpenTelemetry tracing, retry mechanisms, dead letter queue
- [ ] Wave 8: Tests — Domain unit tests, handler tests, Saga tests, `tsc --noEmit`
- [ ] Wave 9: Documentation — `order-service-architecture.md`, `order-service-events.md`, `order-service-saga.md`, `order-service-database.md`

**Verification**:
- `pnpm test` passes in order-service
- `npx tsc --noEmit` shows zero errors
- No `@nestjs` import in any file under `src/domain/`
- `OrderController` delegates only to CommandBus/QueryBus
- Order lifecycle state machine enforced in domain layer
- Saga orchestrator handles both happy path and compensation flows
- All Kafka events consumed idempotently (processed_events deduplication)
- Prometheus metrics exposed at `/metrics`
- Dead letter queue configured for failed event processing

---

### Phase 14: Notification Service Documentation
**Status**: ✅ Complete
**Objective**: Update and improve the documentation for the `notification-service`. Ensure comprehensive README, `.env.example`, and architectural markdown documents.
**Depends on**: Phase 13

**Tasks**:
- [ ] TBD (run /plan 14 to create)

**Verification**:
- TBD

---

### Phase 15: Order Service Documentation
**Status**: ✅ Complete
**Objective**: Update and improve the documentation for the `order-service`. Create comprehensive README.md, `.env.example`, and architectural docs (`order-service-architecture.md`, `order-data-model.md`, `order-lifecycle.md`, `order-events.md`, `order-api-flow.md`) so that a new developer can understand the service quickly. Include architecture diagrams, event flow diagrams, state transition diagrams, and examples where necessary.
**Depends on**: Phase 14

**Tasks**:
- [ ] Plan 15.1: README.md & .env.example (wave 1)
- [ ] Plan 15.2: order-lifecycle.md & order-api-flow.md (wave 1)
- [ ] Plan 15.3: order-data-model.md & enhance existing docs (wave 2)

**Verification**:
- All 14 README sections present with 3+ mermaid diagrams
- .env.example has 10+ commented variables grouped by category
- docs/ folder contains all 5 required files
- All docs match actual codebase (no invented endpoints, statuses, or events)
- No NestJS boilerplate remains in README

---

### Phase 16: Production-Grade Payment Service
**Status**: ⬜ Not Started
**Objective**: Full redesign and production hardening of the payment-service. Transform it into a production-grade microservice following DDD, Clean Architecture, modular NestJS structure, and event-driven patterns. Implements Payment aggregate (Payment entity with id, orderId, userId, amount, currency, status, provider, transactionId, createdAt; PaymentStatus value object: PENDING → PROCESSING → SUCCESS → FAILED → REFUNDED), provider strategy pattern (Stripe, PayPal, Mock) with pluggable abstraction, Kafka event publishing (payment.created, payment.completed, payment.failed, payment.refunded) and consumption (order.created), reliability patterns (idempotency keys, retry logic with exponential backoff, dead-letter queue, timeout handling), observability (structured logging, Prometheus metrics, OpenTelemetry tracing), and comprehensive testing (unit tests, integration tests, provider mocks).
**Depends on**: Phase 15

**Tasks**:
- [ ] Wave 1: Domain layer — Payment aggregate root, PaymentStatus value object (PENDING, PROCESSING, SUCCESS, FAILED, REFUNDED), PaymentProvider enum, Money value object, domain events (PaymentCreated, PaymentCompleted, PaymentFailed, PaymentRefunded), repository port, payment provider port
- [ ] Wave 2: Application layer — CQRS commands (ProcessPayment, RefundPayment), queries (GetPaymentById, GetPaymentsByOrder), command/query handlers, payment processing use case orchestrating provider selection and domain logic
- [ ] Wave 3: Infrastructure layer — Payment provider strategy pattern (StripeProvider, PayPalProvider, MockProvider), provider factory, Kafka producer (payment.created, payment.completed, payment.failed, payment.refunded), Kafka consumer (order.created), idempotency key storage, retry logic with exponential backoff, dead-letter queue, timeout handling, TypeORM entities/repos/mappers
- [ ] Wave 4: Interface layer — DTOs with class-validator, thin PaymentController, Kafka consumer handlers, module wiring, AppModule update
- [ ] Wave 5: Observability — structured logging, Prometheus metrics (payments_processed_total, payments_failed_total, payment_processing_duration, provider_request_duration), OpenTelemetry tracing
- [ ] Wave 6: Tests — Domain unit tests, handler tests, provider mock tests, integration tests, `tsc --noEmit`
- [ ] Wave 7: Documentation — `payment-service-architecture.md` (layered architecture, domain model, provider abstraction), `payment-service-events.md` (published/consumed events), `payment-service-providers.md` (provider strategy, adding new providers)

**Verification**:
- `pnpm test` passes in payment-service
- `npx tsc --noEmit` shows zero errors
- No `@nestjs` import in any file under `src/domain/`
- `PaymentController` delegates only to CommandBus/QueryBus
- Payment lifecycle state machine enforced in domain layer
- Provider strategy pattern allows swapping providers without domain changes
- Idempotency keys prevent duplicate payment processing
- Retry logic with exponential backoff (max 3 retries) and DLQ routing
- All Kafka events published and consumed correctly
- Prometheus metrics exposed at `/metrics`
- Dead letter queue configured for failed event processing

---

### Phase 17: Production-Grade Product Service
**Status**: ⬜ Not Started
**Objective**: Reserved — run `/add-phase` to define.
**Depends on**: Phase 16

**Tasks**:
- [ ] TBD (run /plan 17 to create)

**Verification**:
- TBD

---

### Phase 18: Production-Grade Search Service
**Status**: ⬜ Not Started
**Objective**: Full redesign and production hardening of the search-service. Transform it from a basic scaffold (app module, OpenSearch module, product-sync consumer) into a production-grade search microservice following DDD, Clean Architecture, modular NestJS structure, and event-driven patterns. Implements search architecture across four layers (domain, application, infrastructure, interfaces), event-driven indexing consuming Kafka events (product.created, product.updated, product.deleted), full-text search with filtering/sorting/pagination, autocomplete/search suggestions, query caching with Redis, index optimization strategies, and performance tuning. Uses Elasticsearch/OpenSearch/Meilisearch as the search engine backend.
**Depends on**: Phase 17

**Tasks**:
- [ ] Wave 1: Domain layer — SearchDocument aggregate, SearchQuery value object, SearchResult entity, SearchFilter/SearchSort value objects, domain events (DocumentIndexed, DocumentRemoved, IndexRebuilt), repository ports (SearchIndexPort, SearchQueryPort)
- [ ] Wave 2: Application layer — CQRS commands (IndexProduct, RemoveProduct, RebuildIndex), queries (SearchProducts, GetSuggestions, GetProductById), command/query handlers, indexing orchestrator use case
- [ ] Wave 3: Infrastructure layer — Search engine adapter (Elasticsearch/OpenSearch/Meilisearch client, index mappings, analyzers, tokenizers), Kafka consumers (product.created, product.updated, product.deleted), bulk indexing pipeline, Redis query cache, index management (create/update/reindex/alias rotation), health checks
- [ ] Wave 4: Interface layer — DTOs with class-validator (SearchRequestDto, SearchResponseDto, SuggestionRequestDto), thin SearchController (search, suggest, reindex endpoints), Kafka consumer handlers, Prometheus metrics (search_queries_total, search_latency, index_operations_total, cache_hit_ratio), module wiring, AppModule update
- [ ] Wave 5: Performance — query caching strategy (Redis TTL-based), index optimization (custom analyzers, field mappings, ngram/edge-ngram for autocomplete), pagination strategies (offset vs cursor-based, search_after), query optimization (bool queries, function_score)
- [ ] Wave 6: Tests — Domain unit tests, handler tests, search query builder tests, indexing consumer tests, `tsc --noEmit`
- [ ] Wave 7: Documentation — `search-service-architecture.md` (layered architecture, search engine integration, indexing pipeline), `search-service-indexing.md` (event-driven indexing, bulk operations, reindexing strategy), `search-service-queries.md` (full-text search, filters, sorting, pagination, autocomplete)

**Verification**:
- `pnpm test` passes in search-service
- `npx tsc --noEmit` shows zero errors
- No `@nestjs` import in any file under `src/domain/`
- `SearchController` delegates only to CommandBus/QueryBus
- Kafka consumers process product.created, product.updated, product.deleted events
- Full-text search returns relevant results with highlighting
- Autocomplete/suggestions return within 50ms
- Query caching reduces redundant search engine calls
- Index management supports zero-downtime reindexing
- Prometheus metrics exposed at `/metrics`
- Pagination supports both offset and cursor-based strategies

---

### Phase 17: Production-Grade Product Service
**Status**: ⬜ Not Started
**Objective**: Full redesign and production hardening of the product-service. Refactor it into a production-ready microservice following DDD, Clean Architecture, and modular NestJS structure. Implements domain model (Product aggregate with id, name, description, price, currency, categoryId, status, createdAt; ProductVariant, ProductAttribute, ProductCategory entities; ProductStatus value object: ACTIVE, INACTIVE, OUT_OF_STOCK, ARCHIVED), repository pattern with pagination/filtering/sorting for large catalogs, Kafka event publishing (product.created, product.updated, product.deleted, product.stock.updated), Redis caching strategy for high read traffic, and observability (structured logging, Prometheus metrics, OpenTelemetry tracing).
**Depends on**: Phase 16

**Tasks**:
- [ ] Wave 1: Domain layer — Product aggregate root (id, name, description, price, currency, categoryId, status, createdAt), ProductVariant entity, ProductAttribute entity, ProductCategory entity, ProductStatus value object (ACTIVE, INACTIVE, OUT_OF_STOCK, ARCHIVED), domain events (ProductCreated, ProductUpdated, ProductDeleted, ProductStockUpdated), repository port, cache port
- [ ] Wave 2: Application layer — CQRS commands (CreateProduct, UpdateProduct, DeleteProduct, UpdateProductStock), queries (GetProductById, GetProducts with pagination/filtering/sorting, GetProductsByCategory), command/query handlers orchestrating domain logic and events
- [ ] Wave 3: Infrastructure layer — TypeORM entities/repos/mappers, Redis caching adapter (cache-aside pattern with TTL, cache invalidation on writes), Kafka producer (product.created, product.updated, product.deleted, product.stock.updated), database indexing strategy for large catalogs (categoryId, status, price, createdAt), config module
- [ ] Wave 4: Interface layer — DTOs with class-validator, thin ProductController with pagination/filtering/sorting query params, Kafka consumer handlers, module wiring, AppModule update
- [ ] Wave 5: Observability — structured logging, Prometheus metrics (products_created_total, products_updated_total, cache_hit_ratio, query_duration), OpenTelemetry tracing
- [ ] Wave 6: Tests — Domain unit tests, handler tests, caching tests, repository tests, `tsc --noEmit`
- [ ] Wave 7: Documentation — `product-service-architecture.md` (layered architecture, domain model, caching strategy), `product-service-events.md` (published events, event schemas), `product-service-data-access.md` (repository pattern, pagination, filtering, sorting, indexing)

**Verification**:
- `pnpm test` passes in product-service
- `npx tsc --noEmit` shows zero errors
- No `@nestjs` import in any file under `src/domain/`
- `ProductController` delegates only to CommandBus/QueryBus
- Product status state machine enforced in domain layer
- Repository supports pagination, filtering by status/category, and sorting
- Redis cache-aside pattern with automatic invalidation on writes
- All 4 Kafka events published correctly (product.created, product.updated, product.deleted, product.stock.updated)
- Prometheus metrics exposed at `/metrics`
- Large catalog queries optimized with proper indexing

---

### Phase 18: Production-Grade Search Service
**Status**: ⬜ Not Started
**Objective**: Full redesign and production hardening of the search-service. Transform it into a production-grade microservice with event-driven indexing (consuming product events from Kafka), full-text search with Elasticsearch/OpenSearch, filtering, sorting, pagination, autocomplete/suggestions, query caching, and index management. Follows DDD, Clean Architecture, and modular NestJS patterns.
**Depends on**: Phase 17

**Tasks**:
- [ ] TBD (run /plan 18 to create)

**Verification**:
- TBD

---

### Phase 19: Production-Grade User & Identity Service
**Status**: ⬜ Not Started
**Objective**: Full redesign and production hardening of the user-service. Transform it from a basic NestJS scaffold (app.controller, app.service, app.module) into a production-grade identity service following DDD and Clean Architecture with four distinct layers (domain, application, infrastructure, interfaces). Implements User aggregate (User entity with id, email, username, status, createdAt; UserProfile entity; UserSettings entity), UserStatus value object (ACTIVE, SUSPENDED, DELETED), Kafka event publishing (user.created, user.updated, user.deleted), password hashing (bcrypt/argon2), input validation, rate limiting, repository pattern with database persistence, structured logging, Prometheus metrics, and audit logging for security-critical operations.
**Depends on**: Phase 18

**Tasks**:
- [ ] Wave 1: Domain layer — User aggregate root (id, email, username, status, createdAt), UserProfile entity, UserSettings entity, UserStatus value object (ACTIVE, SUSPENDED, DELETED), domain events (UserCreated, UserUpdated, UserDeleted), repository port, password hashing port
- [ ] Wave 2: Application layer — CQRS commands (CreateUser, UpdateUser, DeleteUser, UpdateUserProfile, UpdateUserSettings, ChangePassword), queries (GetUserById, GetUserByEmail, GetUserByUsername, GetUsers with pagination), command/query handlers orchestrating domain logic and events
- [ ] Wave 3: Infrastructure layer — TypeORM entities/repos/mappers, password hashing adapter (bcrypt/argon2), Kafka producer (user.created, user.updated, user.deleted), input validation pipes, rate limiting middleware, audit log service, config module
- [ ] Wave 4: Interface layer — DTOs with class-validator, thin UserController, module wiring, AppModule update
- [ ] Wave 5: Observability — structured logging, Prometheus metrics (users_created_total, users_updated_total, users_deleted_total, auth_failures_total, rate_limit_hits_total), audit logs for security-critical operations
- [ ] Wave 6: Tests — Domain unit tests, handler tests, password hashing tests, `tsc --noEmit`
- [ ] Wave 7: Documentation — `user-service-architecture.md` (layered architecture, domain model, security design), `user-service-events.md` (published events, event schemas), `user-service-security.md` (password hashing, rate limiting, audit logging)

**Verification**:
- `pnpm test` passes in user-service
- `npx tsc --noEmit` shows zero errors
- No `@nestjs` import in any file under `src/domain/`
- `UserController` delegates only to CommandBus/QueryBus
- User status transitions enforced in domain layer (ACTIVE ↔ SUSPENDED → DELETED)
- Password hashing uses bcrypt/argon2 with proper salt rounds
- Input validation on all DTOs (email format, username length, password strength)
- Rate limiting applied to sensitive endpoints
- All 3 Kafka events published correctly (user.created, user.updated, user.deleted)
- Prometheus metrics exposed at `/metrics`
- Audit logs capture all security-critical operations (login attempts, password changes, account deletions)
