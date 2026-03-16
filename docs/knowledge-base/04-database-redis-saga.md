# Section 6 — Database Architecture

## Database-per-Service Pattern

Each service that requires persistence owns its own database schema. In production, these map to separate **Aurora Serverless v2** clusters.

| Service | Database | Engine | Tables |
|---------|----------|--------|--------|
| **Auth Service** | auth_db | PostgreSQL 15 | `users` |
| **User Service** | users_db | PostgreSQL 15 | `users`, `user_profiles`, `user_settings`, `outbox_events`, `processed_events` |
| **Product Service** | products_db | PostgreSQL 15 | `products`, `outbox_events`, `processed_events` |
| **Order Service** | orders_db | PostgreSQL 15 | `orders`, `order_items`, `outbox_events`, `processed_events` |
| **Inventory Service** | inventory_db | PostgreSQL 15 | `product_inventory`, `stock_reservations`, `stock_movements`, `outbox_events`, `processed_events` |
| **Payment Service** | payments_db | PostgreSQL 15 | `payments`, `outbox_events`, `processed_events` |
| **Search Service** | — | OpenSearch 2.11 | `products` index (alias) |
| **Cart Service** | — | Redis 7 | `cart:{userId}` keys |
| **Notification Service** | — | In-memory | No persistent store |

## Schema Details

### Order Service — `orders` table

```sql
CREATE TABLE orders (
  id           UUID PRIMARY KEY,
  user_id      UUID NOT NULL,
  status       VARCHAR(30) NOT NULL DEFAULT 'CREATED',
  total_price  BIGINT NOT NULL,          -- stored in cents
  currency     VARCHAR(3) NOT NULL DEFAULT 'USD',
  version      INT NOT NULL DEFAULT 1,   -- optimistic locking
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE order_items (
  id           UUID PRIMARY KEY,
  order_id     UUID NOT NULL REFERENCES orders(id),
  product_id   UUID NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  quantity     INT NOT NULL,
  unit_price   BIGINT NOT NULL,          -- stored in cents
  currency     VARCHAR(3) NOT NULL DEFAULT 'USD'
);
```

### Inventory Service — `product_inventory` table

```sql
CREATE TABLE product_inventory (
  product_id          UUID PRIMARY KEY,
  sku                 VARCHAR(100) UNIQUE NOT NULL,
  available_stock     INT NOT NULL DEFAULT 0,
  reserved_stock      INT NOT NULL DEFAULT 0,
  sold_stock          INT NOT NULL DEFAULT 0,
  total_stock         INT NOT NULL DEFAULT 0,
  low_stock_threshold INT NOT NULL DEFAULT 100,
  version             INT NOT NULL DEFAULT 1,   -- OCC
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Invariant: available + reserved + sold = total
  CONSTRAINT stock_invariant CHECK (available_stock + reserved_stock + sold_stock = total_stock)
);

CREATE TABLE stock_reservations (
  id              UUID PRIMARY KEY,
  product_id      UUID NOT NULL REFERENCES product_inventory(product_id),
  quantity         INT NOT NULL,
  reference_id     UUID NOT NULL,           -- orderId or cartId
  reference_type   VARCHAR(10) NOT NULL,     -- 'ORDER' or 'CART'
  status           VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  expires_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE stock_movements (
  id           UUID PRIMARY KEY,
  product_id   UUID NOT NULL,
  type         VARCHAR(20) NOT NULL,     -- RESERVE, RELEASE, CONFIRM, REPLENISH
  quantity     INT NOT NULL,
  reference_id UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Payment Service — `payments` table

```sql
CREATE TABLE payments (
  id              UUID PRIMARY KEY,
  order_id        UUID NOT NULL,
  user_id         UUID NOT NULL,
  amount_in_cents BIGINT NOT NULL,
  currency        VARCHAR(3) NOT NULL DEFAULT 'USD',
  status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  provider        VARCHAR(20) NOT NULL,     -- STRIPE, PAYPAL, MOCK
  transaction_id  VARCHAR(255),
  idempotency_key VARCHAR(255) UNIQUE,
  fail_reason     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Shared — `outbox_events` table (every service with PostgreSQL)

```sql
CREATE TABLE outbox_events (
  id         UUID PRIMARY KEY,
  type       VARCHAR(100) NOT NULL,
  payload    JSONB NOT NULL,
  processed  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for relay polling
CREATE INDEX idx_outbox_unprocessed ON outbox_events (processed, created_at) WHERE processed = FALSE;
```

### Shared — `processed_events` table (idempotency)

```sql
CREATE TABLE processed_events (
  event_id    VARCHAR(255) PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Consistency Model

- **Within a service**: Strong consistency (PostgreSQL ACID transactions)
- **Across services**: Eventual consistency via Kafka events
- **Atomicity guarantee**: UnitOfWork pattern — business operation + outbox write in single transaction
- **Money representation**: Stored as `BIGINT` cents to avoid floating-point precision issues

## Indexing Strategies

| Table | Index | Type | Purpose |
|-------|-------|------|---------|
| `orders` | PK on `id` | B-tree | Primary lookup |
| `orders` | `user_id` | B-tree | Get orders by user |
| `orders` | `status` | B-tree | Filter by status |
| `order_items` | `order_id` | B-tree (FK) | Join with orders |
| `product_inventory` | PK on `product_id` | B-tree | Primary lookup |
| `product_inventory` | UNIQUE on `sku` | B-tree | SKU lookup |
| `stock_reservations` | `reference_id, reference_type` | Composite | Find reservations by order/cart |
| `payments` | `order_id` | B-tree | Find payments by order |
| `payments` | UNIQUE on `idempotency_key` | B-tree | Idempotent processing |
| `outbox_events` | Partial on `processed = FALSE` | B-tree | Relay polling |
| `processed_events` | PK on `event_id` | B-tree | Idempotency check |

---

# Section 7 — Redis & Caching

## Redis Usage Map

| Service | Redis Purpose | Key Pattern | TTL |
|---------|--------------|-------------|-----|
| **API Gateway** | Rate limiting (ThrottlerGuard) | `throttle:*` | 60s |
| **Auth Service** | Refresh token storage | `refresh:{userId}:{tokenId}` | 7 days |
| **Auth Service** | Session index | `sessions:{userId}` (SET) | 7 days |
| **Auth Service** | JTI blocklist | `blocklist:jti:{jti}` | Remaining token TTL |
| **Auth Service** | Login attempt tracking | `login-attempts:{email}` | 15 min |
| **Cart Service** | Cart data (primary store) | `cart:{userId}` | 30 days |
| **Cart Service** | Cart outbox | `outbox:cart:{eventId}` | Until processed |
| **Inventory Service** | Stock level cache | `stock:{productId}` | Configurable |
| **Inventory Service** | Distributed locks | `lock:inventory:{productId}` | 5s |
| **Product Service** | Product cache | `product:{productId}` | Configurable |
| **Search Service** | Search result cache | `search:{queryHash}` | Configurable |

## Cache Invalidation Strategy

- **Cart**: No cache invalidation needed — Redis IS the source of truth
- **Auth tokens**: Explicit deletion on logout/revocation via `revokeRefreshToken()` and `blocklistJti()`
- **Product cache**: Write-through invalidation — cache updated on product mutations
- **Search cache**: Event-driven invalidation — when `product.updated` event consumed
- **Stock cache**: Updated after every inventory operation (reserve/release/confirm)

## Distributed Locking

The `RedisLockService` in inventory-service uses the **Redlock-like** pattern:

```typescript
// Acquire: SET key requestId PX ttlMs NX
const acquired = await redis.set(key, requestId, 'PX', 5000, 'NX');

// Release: Lua script — only deletes if value matches (prevents accidental release)
const RELEASE_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;
```

Key design decisions:
- **NX flag**: Only set if not exists — prevents two clients from acquiring the same lock
- **PX TTL**: Auto-expires lock if holder crashes — prevents deadlocks
- **RequestId matching**: Lua script verifies ownership before release — prevents releasing another client's lock

---

# Section 8 — Saga & Distributed Transactions

## Checkout Saga Architecture

The system uses **Orchestrated Saga** pattern with the Order Service as the orchestrator.

### Saga Steps

| Step | Service | Action | Compensation |
|------|---------|--------|-------------|
| 1 | Order Service | Create order (CREATED) | — |
| 2 | Inventory Service | Reserve stock | Release reserved stock |
| 3 | Order Service (Saga) | Request payment | Cancel order |
| 4 | Payment Service | Process payment | Refund payment |
| 5 | Order Service | Confirm order (PAID) | — |

### Saga State Machine

```
                    ┌──────────────────────────────────────────────┐
                    │              CHECKOUT SAGA                    │
                    │                                              │
    Order Created ──┤                                              │
         │          │  inventory.reserved ──→ Request Payment      │
         │          │       │                      │               │
         │          │       │               payment.processed      │
         │          │       │                      │               │
         │          │       │               Order PAID ──→ Done    │
         │          │       │                                      │
         │          │  inventory.reservation_failed                │
         │          │       │                                      │
         │          │       └──→ Cancel Order ──→ Done (FAILED)    │
         │          │                                              │
         │          │  payment.failed                              │
         │          │       │                                      │
         │          │       └──→ Cancel Order ──→ inventory.released│
         │          │                          ──→ Done (FAILED)   │
         │          │                                              │
         │          │  Payment request exception                   │
         │          │       │                                      │
         │          │       └──→ Cancel Order (compensation)       │
         │          │           ──→ Done (FAILED)                  │
         │          └──────────────────────────────────────────────┘
```

### Implementation Details

The `CheckoutSagaOrchestrator` class handles the `onInventoryReserved` event:

1. **Guards**: Only proceeds if order status is `CREATED`
2. **Transitions**: Calls `order.requestPayment()` → status becomes `PENDING_PAYMENT`
3. **Persists** the order state change
4. **Publishes** `OrderPaymentRequestedEvent` via outbox
5. **Calls** `paymentService.requestPayment()` synchronously
6. **On failure**: Compensates by executing `CancelOrderHandler` which cancels the order and emits `order.cancelled`
7. **On critical compensation failure**: Logs CRITICAL error for manual intervention

### Timeout and Retry

- Payment timeout: Handled by the HTTP client timeout (5s default from TimeoutInterceptor)
- Saga has no built-in timer — relies on the payment service responding or timing out
- `ReservationExpiryWorker` in inventory service handles stale reservations
