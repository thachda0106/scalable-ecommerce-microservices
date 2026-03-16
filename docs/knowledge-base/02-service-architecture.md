# Section 3 — Service Architecture

Every service follows a **Clean Architecture / Hexagonal Architecture** layout with DDD tactical patterns:

```
src/
├── domain/                  # Inner core — zero framework dependencies
│   ├── entities/            # Aggregate roots and child entities
│   ├── value-objects/       # Immutable value types (Money, OrderStatus, ProductId)
│   ├── events/              # Domain events (raised by entities)
│   ├── errors/              # Domain-specific exceptions
│   └── ports/               # Repository interfaces (abstractions)
├── application/             # Use cases / orchestration
│   ├── commands/            # Command DTOs (write operations)
│   ├── queries/             # Query DTOs (read operations)
│   ├── handlers/            # Command/Query handlers (CQRS)
│   ├── ports/               # Application-level port interfaces
│   └── services/            # Application services
├── infrastructure/          # Outer ring — framework + adapter implementations
│   ├── persistence/         # TypeORM entities, repositories, mappers
│   ├── kafka/               # Kafka producers, consumers, outbox relay
│   ├── redis/ or cache/     # Redis adapters (caching, locking)
│   └── resilience/          # Circuit breakers, retry policies
├── interfaces/              # HTTP layer
│   ├── controllers/         # REST controllers
│   └── dto/                 # Request/response DTOs with class-validator
├── health/                  # Terminus health check
└── app.module.ts            # NestJS root module (DI wiring)
```

---

## API Gateway (Port 3000)

**Purpose**: Single entry point for all client requests. Handles authentication, rate limiting, request routing, and BFF (Backend for Frontend) aggregation.

**Domain ownership**: None — orchestration only.

**Database**: None.

**Cache**: Redis (rate limiting via `nestjs-throttler-storage-redis`).

**Events produced**: None.

**Events consumed**: None.

**Key components**:
- `GatewayController` — proxy routes for all 9 downstream services using `@All('service/*path')` pattern
- `JwtAuthGuard` — validates Bearer tokens via `passport-jwt`; `@Public()` decorator skips auth
- `JwtStrategy` — extracts `{ sub, email, roles }` from JWT payload
- `BaseHttpClient` — Axios wrapper that forwards HTTP method, body, query params, and injects HMAC-signed internal headers
- `TimeoutInterceptor` — 5-second default timeout on all proxied requests
- `RequestIdMiddleware` — generates `x-request-id` for tracing
- **BFF Aggregation Services**: `ProductPageService`, `CartSummaryService`, `OrderDetailsService`, `DashboardService` — compose data from multiple services into single responses

**Routing map**:
| Route Prefix | Target Service | Auth Required |
|-------------|---------------|---------------|
| `/auth/*` | Auth Service (3001) | No (`@Public`) |
| `/users/*` | User Service (3002) | Yes |
| `/products/*` | Product Service (3003) | No (`@Public`) |
| `/search/*` | Search Service (3004) | No (`@Public`) |
| `/cart/*` | Cart Service (3005) | Yes |
| `/orders/*` | Order Service (3006) | Yes |
| `/inventory/*` | Inventory Service (3007) | Yes |
| `/payments/*` | Payment Service (3008) | Yes |
| `/notifications/*` | Notification Service (3009) | Yes |
| `/product-page/:id` | BFF Aggregate | No (`@Public`) |
| `/cart-summary` | BFF Aggregate | Yes |
| `/order-details/:id` | BFF Aggregate | Yes |

---

## Auth Service (Port 3001)

**Purpose**: Authentication, JWT lifecycle management, OAuth 2.0 (Google/GitHub), session blacklisting.

**Domain ownership**: Identity & Access Management.

**Database**: PostgreSQL (users table with `password_hash`, `oauth_provider`, `oauth_provider_id`).

**Cache**: Redis — refresh token storage, JTI blocklist, login attempt tracking.

**Events produced**: `user.created` (on registration).

**Events consumed**: None.

**Key domain model**:
- `User` entity with `Email` VO (validated, normalized), `Password` VO (bcrypt hashed), `OAuthIdentity` VO, `Role` enum (USER, ADMIN)
- Domain events: `UserRegisteredEvent`, `UserLoggedInEvent`, `UserLoginFailedEvent`, `UserPasswordChangedEvent`, `UserDeactivatedEvent`

**Internal architecture**:
- **CQRS**: `LoginQuery` → `LoginHandler`, `RegisterCommand` → `RegisterHandler`, `RefreshTokenCommand` → `RefreshTokenHandler`, `LogoutCommand` → `LogoutHandler`
- **JWT**: dual-token architecture — short-lived access token (15min) + long-lived refresh token (7 days) stored in Redis
- **Redis token store**: Keys `refresh:{userId}:{tokenId}` with session index `sessions:{userId}` (Redis SET) for O(1) bulk revocation
- **JTI blocklist**: `blocklist:jti:{jti}` — blocks revoked access tokens for remaining TTL
- **Login attempt tracking**: `LoginAttemptStore` using Redis for brute-force protection
- **OAuth**: Google + GitHub strategies via Passport.js

---

## User Service (Port 3002)

**Purpose**: Customer profile management, address books, user settings, account lifecycle.

**Domain ownership**: Customer Management.

**Database**: PostgreSQL (users, user_profiles, user_settings tables).

**Cache**: None (direct DB queries).

**Events produced**: `user.created`, `user.updated`, `user.deleted`, `user.suspended`.

**Events consumed**: None.

**Key domain model**:
- `User` (aggregate root) with `UserProfile` and `UserSettings` child entities
- Status lifecycle: ACTIVE → SUSPENDED → ACTIVE, ACTIVE → DELETED
- Value objects: `Email`, `UserId`, `UserStatus`, `PhoneNumber`
- Domain events: `UserCreatedEvent`, `UserUpdatedEvent`, `UserDeletedEvent`, `UserSuspendedEvent`, `UserReactivatedEvent`

**CQRS handlers**:
- Commands: `CreateUser`, `UpdateUser`, `UpdateUserProfile`, `UpdateUserSettings`, `SuspendUser`, `ReactivateUser`, `DeleteUser`
- Queries: `GetUserById`, `GetUserByEmail`, `GetUserByUsername`, `GetUsers` (paginated)

---

## Product Service (Port 3003)

**Purpose**: System of record for the product catalog — pricing, attributes, categories.

**Domain ownership**: Product Catalog (write model).

**Database**: PostgreSQL (products table with JSONB attributes).

**Cache**: Redis (product cache adapter).

**Events produced**: `product.created`, `product.updated`, `product.deleted`, `product.stock_updated`.

**Events consumed**: None.

**Key domain model**:
- `Product` (aggregate root) with `Money` VO, `ProductId` VO, `ProductStatus` VO (DRAFT → ACTIVE → ARCHIVED → DELETED)
- Domain events trigger CQRS sync — Search Service consumes product events to build its read model

**CQRS handlers**:
- Commands: `CreateProduct`, `UpdateProduct`, `UpdateProductStatus`, `DeleteProduct`
- Queries: `GetProductById`, `GetProducts` (paginated, filtered)
- Outbox relay publishes via Transactional Outbox pattern

---

## Search Service (Port 3004)

**Purpose**: Denormalized read model for high-performance product search. Consumes product events from Kafka to maintain an OpenSearch index.

**Domain ownership**: Product Discovery (read model, CQRS reader).

**Database**: OpenSearch (index alias: `products`).

**Cache**: Redis (search result caching).

**Events produced**: None.

**Events consumed**: `product.created`, `product.updated`, `product.deleted`.

**OpenSearch index mapping**:
```json
{
  "id":           "keyword",
  "name":         "search_as_you_type (max_shingle_size: 3)",
  "name_suggest": "completion",
  "description":  "text (standard analyzer)",
  "price":        "float",
  "status":       "keyword",
  "categoryId":   "keyword",
  "attributes":   "object",
  "indexedAt":     "date"
}
```

**Key features**:
- `search_as_you_type` field for autocomplete/typeahead
- `completion` field for suggestion queries
- Full-text search with multi_match across name + description
- Faceted filtering by category, price range, status
- `ProductEventConsumer` listens to Kafka and triggers `IndexProductCommand` or `RemoveProductCommand`
- `RebuildIndexCommand` for full index reconstruction

---

## Cart Service (Port 3005)

**Purpose**: Ephemeral shopping cart state for ultra-low latency add/remove/update operations.

**Domain ownership**: Shopping Cart.

**Database**: Redis (primary store — no SQL database).

**Cache**: Redis IS the primary store (cart data stored as JSON with TTL).

**Events produced**: `cart.item_added`, `cart.item_removed`, `cart.cleared`, `cart.expired`.

**Events consumed**: None.

**Key domain model**:
- `Cart` (aggregate root) with `CartItem` child entities
- Business rules: max 50 distinct items, quantity 1-99 per item, 30-day auto-expiry
- `ProductId` VO, `Quantity` VO (validated range)
- Optimistic concurrency via `version` counter on Redis writes
- Domain events: `ItemAddedEvent`, `ItemRemovedEvent`, `CartClearedEvent`, `ItemQuantityUpdatedEvent`

**Redis storage pattern**:
- Key: `cart:{userId}` → JSON blob of cart state
- TTL: 30 days, refreshed on every mutation
- Optimistic locking: version check on write (CAS semantics)
- HTTP clients validate against Product Service and Inventory Service

---

## Order Service (Port 3006) — SAGA ORCHESTRATOR

**Purpose**: Order lifecycle + **Checkout Saga Orchestrator**. This is the most complex service.

**Domain ownership**: Order Management + distributed transaction coordination.

**Database**: PostgreSQL (orders, order_items, outbox_events, processed_events).

**Cache**: None.

**Events produced**: `order.created`, `order.updated`, `order.cancelled`, `order.completed`.

**Events consumed**: `inventory.reserved`, `inventory.reservation_failed`, `payment.processed`, `payment.failed`.

**Key domain model — Order aggregate**:

```
Order (Aggregate Root)
├── OrderId (UUID value object)
├── UserId (value object)
├── OrderStatus (state machine value object)
│   States: CREATED → PENDING_PAYMENT → PAID → CONFIRMED → SHIPPED → DELIVERED
│           CREATED → CANCELLED
│           PENDING_PAYMENT → CANCELLED
│           PAID → REFUNDED
│           DELIVERED → REFUNDED
├── Money (value object — amount in cents + currency)
├── OrderItem[] (child entities)
│   ├── productId, productName
│   ├── quantity
│   └── unitPrice (Money VO)
└── domainEvents[] (internal buffer)
```

**Order status state machine transitions**:
```
CREATED ──────────→ PENDING_PAYMENT ──→ PAID ──→ CONFIRMED ──→ SHIPPED ──→ DELIVERED
   │                       │                          │                          │
   └──→ CANCELLED ←────────┘              REFUNDED ←──┘                REFUNDED ←┘
```

**Saga orchestration** — `CheckoutSagaOrchestrator`:
1. `OrderCreated` → Inventory Service listens and reserves stock
2. `InventoryReserved` → Saga calls `order.requestPayment()` → transitions to `PENDING_PAYMENT` → calls `IPaymentService.requestPayment()`
3. `PaymentProcessed` → `ConfirmPaymentHandler` transitions order to `PAID`
4. Compensation: `InventoryFailed` → `CancelOrderHandler` cancels order
5. Compensation: `PaymentFailed` → `CancelOrderHandler` cancels order → emits `order.cancelled` → Inventory releases

---

## Inventory Service (Port 3007)

**Purpose**: Stock level tracking, atomic reservation, oversell prevention.

**Domain ownership**: Inventory Control.

**Database**: PostgreSQL (product_inventory, stock_reservations, stock_movements, outbox_events, processed_events).

**Cache**: Redis (stock level cache + distributed locks).

**Events produced**: `inventory.reserved`, `inventory.reservation_failed`, `inventory.released`.

**Events consumed**: `order.events` (OrderConfirmed → confirm stock, OrderCancelled → release stock), `cart.events` (CartExpired → release stock).

**Key domain model — ProductInventory aggregate**:

```
ProductInventory (Aggregate Root)
├── productId
├── sku
├── availableStock     ┐
├── reservedStock      ├── Invariant: available + reserved + sold = total
├── soldStock          │
├── totalStock         ┘
├── lowStockThreshold
└── version (OCC)
```

**Domain operations**:
- `reserve(qty)` — decrements available, increments reserved. Throws `InsufficientStockError`.
- `release(qty)` — decrements reserved, increments available. Used for order failures/cart expiry.
- `confirm(qty)` — moves from reserved to sold. Permanent deduction.
- `replenish(qty)` — increases available and total (warehouse restock).

**Concurrency control**:
- **Optimistic concurrency** via `version` column (TypeORM `@VersionColumn`)
- **Distributed locks** via `RedisLockService` — Lua-script-backed `SET NX PX` with safe release
- **Idempotent consumers** — `processed_events` table prevents duplicate Kafka message processing

---

## Payment Service (Port 3008)

**Purpose**: Payment gateway integration, status tracking, idempotent processing, refunds.

**Domain ownership**: Payment Processing.

**Database**: PostgreSQL (payments, outbox_events, processed_events).

**Cache**: None.

**Events produced**: `payment.processed`, `payment.failed`.

**Events consumed**: `order.events` (OrderPaymentRequested → process payment).

**Key domain model**:
- `Payment` entity with status machine: PENDING → PROCESSING → SUCCESS/FAILED, SUCCESS → REFUNDED
- `PaymentProviderEnum`: STRIPE, PAYPAL, BANK_TRANSFER, MOCK
- `Money` VO (amount in cents + currency), `PaymentId` VO, `PaymentStatus` VO
- `idempotencyKey` field prevents duplicate charges
- Provider Factory pattern for pluggable payment gateways

---

## Notification Service (Port 3009)

**Purpose**: Multi-channel notification delivery (email, SMS, push, in-app). Currently mocked providers.

**Domain ownership**: Communications.

**Database**: In-memory repositories (no persistent database).

**Cache**: None.

**Events produced**: `notification.sent`, `notification.failed`.

**Events consumed**: `order.events` (OrderConfirmed, OrderFailed), `cart.events`, `user.events`.

**Key architecture**:
- `NotificationOrchestrator` — coordinates send workflow
- `ChannelProviderFactory` — returns provider by channel type
- Providers: `SendGridEmailProvider`, `TwilioSmsProvider`, `FirebasePushProvider`, `InAppProvider`
- DLQ processing: `DlqProcessorService` retries failed notifications
- `NotificationTemplate` entity with variable interpolation
- Retry strategy with exponential backoff
