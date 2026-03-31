# Phase 4 — Microservices Design

> **Why this phase exists:** Phases 1-3 defined the "what" and the "platform." This phase defines
> each service in detail — its responsibilities, APIs, data model, events, and integrations.
> Without this, developers build services that overlap, miss events, or create circular dependencies.

---

## 4.1 Service Design Template

Every service follows this design specification before implementation begins:

```
Service: [Name]
Context: [DDD Bounded Context]
Database: [PostgreSQL / Redis / OpenSearch / None]
Port: [3001-3009]

Responsibility:
  - What this service owns
  - What it does NOT own

APIs Exposed:
  - [Method] [Path] → [Description]

Events Published:
  - [topic.name.v1] → [when]

Events Consumed:
  - [topic.name.v1] → [from which service, what action]

Write Model:
  - [Tables/Entities]

Read Model (if CQRS):
  - [Denormalized views]

Cache Strategy:
  - [What is cached, TTL, invalidation]

External Integrations:
  - [APIs called synchronously]
```

---

## 4.2 Auth Service

### Overview

| Property | Value |
|----------|-------|
| **Context** | Identity |
| **Database** | Redis (token blacklist, sessions) |
| **Port** | 3001 |

### Responsibility

- JWT token generation (access + refresh)
- Token validation and refresh
- Password hashing and verification
- Token blacklisting (logout)
- Role-Based Access Control (RBAC)

> [!NOTE]
> Auth Service does NOT store user profiles — that belongs to User Service.
> Auth only knows: email, hashed password, roles.

### APIs

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | No | Register new user |
| POST | `/auth/login` | No | Login, returns JWT |
| POST | `/auth/refresh` | No | Refresh access token |
| POST | `/auth/logout` | Yes | Blacklist current token |
| GET | `/auth/validate` | — | Internal: validate JWT (used by API Gateway) |

### Events Published

| Topic | Event | When |
|-------|-------|------|
| `user.events` | `UserRegistered` | After successful registration |

### Events Consumed

None — Auth is a pure command service.

### Data Model

```
Redis Keys:
  blacklist:{tokenId}     → "1"          TTL: token expiry
  refresh:{userId}        → refreshToken  TTL: 7 days
  session:{sessionId}     → {userId, ip}  TTL: 30 days
```

### Folder Structure

```
apps/auth-service/src/
├── auth.module.ts
├── controllers/
│   └── auth.controller.ts
├── services/
│   ├── auth.service.ts
│   ├── token.service.ts
│   └── password.service.ts
├── guards/
│   └── local-auth.guard.ts
├── strategies/
│   ├── local.strategy.ts
│   └── jwt.strategy.ts
├── dto/
│   ├── login.dto.ts
│   ├── register.dto.ts
│   └── refresh-token.dto.ts
└── infrastructure/
    ├── redis/
    │   └── token-store.service.ts
    └── kafka/
        └── producers/
            └── user-registered.producer.ts
```

---

## 4.3 User Service

### Overview

| Property | Value |
|----------|-------|
| **Context** | Identity |
| **Database** | PostgreSQL |
| **Port** | 3002 |

### Responsibility

- User profile management (name, avatar, preferences)
- Address book management
- User metadata and settings

### APIs

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/users/me` | Yes | Get current user profile |
| PUT | `/users/me` | Yes | Update profile |
| GET | `/users/:id` | Admin | Get any user |
| POST | `/users/addresses` | Yes | Add address |
| PUT | `/users/addresses/:id` | Yes | Update address |
| DELETE | `/users/addresses/:id` | Yes | Delete address |

### Events Published

| Topic | Event | When |
|-------|-------|------|
| `user.events` | `UserProfileUpdated` | Profile changed |
| `user.events` | `UserDeactivated` | Account deactivated |

### Events Consumed

| Topic | Event | Action |
|-------|-------|--------|
| `user.events` | `UserRegistered` | Create default profile |

### Write Model

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(20),
  avatar_url TEXT,
  tenant_id UUID NOT NULL,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE user_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  label VARCHAR(50),          -- 'home', 'work', 'other'
  street VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100),
  postal_code VARCHAR(20) NOT NULL,
  country VARCHAR(2) NOT NULL, -- ISO 3166-1 alpha-2
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_addresses_user ON user_addresses(user_id);
```

---

## 4.4 Product Service

### Overview

| Property | Value |
|----------|-------|
| **Context** | Catalog |
| **Database** | PostgreSQL |
| **Port** | 3003 |

### Responsibility

- Product catalog CRUD (source of truth)
- Category management
- Pricing management
- Product attributes and variants
- **Write side of CQRS** (publishes events for Search to consume)

### APIs

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/products` | No | List products (paginated) |
| GET | `/products/:id` | No | Get product by ID |
| POST | `/products` | Admin | Create product |
| PUT | `/products/:id` | Admin | Update product |
| DELETE | `/products/:id` | Admin | Soft delete product |
| GET | `/products/categories` | No | List categories |

### Events Published

| Topic | Event | When |
|-------|-------|------|
| `product.events` | `ProductCreated` | New product added |
| `product.events` | `ProductUpdated` | Product details changed |
| `product.events` | `ProductDeleted` | Product soft-deleted |
| `product.events` | `ProductPriceChanged` | Price updated |

### Events Consumed

None — Product Service is the source of truth.

### Write Model

```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  sku VARCHAR(50) UNIQUE NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  compare_at_price DECIMAL(10,2),
  currency VARCHAR(3) DEFAULT 'USD',
  category_id UUID REFERENCES categories(id),
  brand VARCHAR(100),
  images JSONB DEFAULT '[]',
  attributes JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'draft',  -- draft, active, archived
  tenant_id UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  version INTEGER DEFAULT 1            -- For optimistic locking
);

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  parent_id UUID REFERENCES categories(id),
  sort_order INTEGER DEFAULT 0,
  tenant_id UUID NOT NULL
);

CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_tenant ON products(tenant_id);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_status ON products(status);
```

### Cache Strategy

```
Redis:
  product:{id}           → Product JSON      TTL: 5 min
  products:list:{hash}   → Paginated list    TTL: 60 sec

Invalidation:
  On ProductUpdated event → delete product:{id}
  On any write → delete products:list:*
```

---

## 4.5 Search Service

### Overview

| Property | Value |
|----------|-------|
| **Context** | Catalog (Read Side) |
| **Database** | OpenSearch + PostgreSQL (inbox) |
| **Port** | 3004 |

### Responsibility

- Full-text product search
- Faceted filtering (category, price range, brand)
- Autocomplete suggestions
- **Read side of CQRS** (consumes events from Product Service)

### APIs

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/search` | No | Full-text search with filters |
| GET | `/search/suggest` | No | Autocomplete suggestions |
| POST | `/search/reindex` | Admin | Trigger full reindex |

### Events Consumed

| Topic | Event | Action |
|-------|-------|--------|
| `product.events` | `ProductCreated` | Index new document |
| `product.events` | `ProductUpdated` | Update existing document |
| `product.events` | `ProductDeleted` | Remove from index |

### OpenSearch Index Mapping

```json
{
  "mappings": {
    "properties": {
      "id":          { "type": "keyword" },
      "name":        { "type": "text", "analyzer": "standard",
                       "fields": { "keyword": { "type": "keyword" } } },
      "description": { "type": "text" },
      "sku":         { "type": "keyword" },
      "price":       { "type": "float" },
      "category":    { "type": "keyword" },
      "brand":       { "type": "keyword" },
      "tags":        { "type": "keyword" },
      "status":      { "type": "keyword" },
      "inStock":     { "type": "boolean" },
      "rating":      { "type": "float" },
      "createdAt":   { "type": "date" },
      "suggest":     { "type": "completion" }
    }
  }
}
```

---

## 4.6 Inventory Service

### Overview

| Property | Value |
|----------|-------|
| **Context** | Fulfillment |
| **Database** | PostgreSQL |
| **Port** | 3007 |

### Responsibility

- Track stock levels per product per warehouse
- Reserve stock during checkout (Saga participant)
- Release stock on order cancellation (Saga compensation)
- Optimistic Concurrency Control for concurrent reservations

### APIs

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/inventory/:productId` | Yes | Get current stock level |
| PUT | `/inventory/:productId` | Admin | Set stock level |
| POST | `/inventory/bulk` | Admin | Bulk update stock |

### Events Published

| Topic | Event | When |
|-------|-------|------|
| `inventory.events` | `StockReserved` | Stock reserved for order (Saga step 1 success) |
| `inventory.events` | `StockReservationFailed` | Insufficient stock (Saga step 1 failure) |
| `inventory.events` | `StockReleased` | Stock released due to order cancellation |
| `inventory.events` | `StockLevelChanged` | Admin updated stock |

### Events Consumed

| Topic | Event | Action |
|-------|-------|--------|
| `order.events` | `OrderCreated` / `ReserveStock` | Reserve stock for order items |
| `order.events` | `OrderCancelled` / `ReleaseStock` | Release reserved stock |
| `product.events` | `ProductCreated` | Initialize stock record |

### Write Model

```sql
CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID UNIQUE NOT NULL,
  available_quantity INTEGER NOT NULL DEFAULT 0,
  reserved_quantity INTEGER NOT NULL DEFAULT 0,
  warehouse_id UUID,
  tenant_id UUID NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,    -- OCC version
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE stock_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  product_id UUID NOT NULL,
  quantity INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'reserved',  -- reserved, confirmed, released
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP                    -- Auto-release if not confirmed
);

CREATE INDEX idx_inventory_product ON inventory(product_id);
CREATE INDEX idx_reservations_order ON stock_reservations(order_id);
```

### OCC (Optimistic Concurrency Control)

```typescript
async reserveStock(productId: string, quantity: number, orderId: string): Promise<void> {
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const inventory = await this.inventoryRepo.findByProductId(productId);

    if (inventory.availableQuantity < quantity) {
      throw new InsufficientStockError(productId, quantity, inventory.availableQuantity);
    }

    const result = await this.inventoryRepo
      .createQueryBuilder()
      .update(Inventory)
      .set({
        availableQuantity: () => `available_quantity - ${quantity}`,
        reservedQuantity: () => `reserved_quantity + ${quantity}`,
        version: () => 'version + 1',
      })
      .where('id = :id AND version = :version', {
        id: inventory.id,
        version: inventory.version,   // OCC check
      })
      .execute();

    if (result.affected === 1) {
      // Success — create reservation record
      await this.reservationRepo.save({
        orderId, productId, quantity, status: 'reserved',
      });
      return;
    }

    // Version conflict — another request modified the row. Retry.
  }

  throw new ConcurrencyError('Failed to reserve stock after retries');
}
```

---

## 4.7 Cart Service

### Overview

| Property | Value |
|----------|-------|
| **Context** | Shopping |
| **Database** | Redis |
| **Port** | 3005 |

### Responsibility

- Add/remove/update cart items
- Cart totals calculation
- Cart expiration (TTL)
- Merge guest cart with user cart on login

### APIs

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/cart` | Yes | Get current cart |
| POST | `/cart/items` | Yes | Add item to cart |
| PUT | `/cart/items/:productId` | Yes | Update quantity |
| DELETE | `/cart/items/:productId` | Yes | Remove item |
| DELETE | `/cart` | Yes | Clear cart |

### Events Published

| Topic | Event | When |
|-------|-------|------|
| `cart.events` | `CartCheckedOut` | User initiates checkout |

### Data Model (Redis)

```
Key: cart:{userId}
Type: Hash
TTL: 7 days

Value:
{
  "userId": "user-123",
  "items": [
    {
      "productId": "prod-456",
      "name": "Wireless Headphones",
      "price": 79.99,
      "quantity": 2,
      "imageUrl": "https://cdn.example.com/img/prod-456.jpg"
    }
  ],
  "subtotal": 159.98,
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

> [!TIP]
> Cart stores product name and price as a **snapshot** at the time of add. This avoids sync calls
> to Product Service on every cart read. If the price changes, it's updated when the user views
> the cart (lazy refresh).

---

## 4.8 Order Service

### Overview

| Property | Value |
|----------|-------|
| **Context** | Shopping |
| **Database** | PostgreSQL |
| **Port** | 3006 |

### Responsibility

- Order lifecycle management
- **Checkout Saga Orchestrator** (coordinates Inventory + Payment)
- Order history and status tracking

### APIs

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/orders` | Yes | Create order (start checkout saga) |
| GET | `/orders` | Yes | List user's orders |
| GET | `/orders/:id` | Yes | Get order details |
| POST | `/orders/:id/cancel` | Yes | Cancel order |

### Events Published

| Topic | Event | When |
|-------|-------|------|
| `order.events` | `OrderCreated` | Order created, saga begins |
| `order.events` | `ReserveStock` | Command to Inventory Service |
| `order.events` | `ProcessPayment` | Command to Payment Service |
| `order.events` | `OrderConfirmed` | Saga completed successfully |
| `order.events` | `OrderFailed` | Saga failed, compensations applied |
| `order.events` | `OrderCancelled` | User cancelled order |

### Events Consumed

| Topic | Event | Action |
|-------|-------|--------|
| `inventory.events` | `StockReserved` | Proceed to payment |
| `inventory.events` | `StockReservationFailed` | Fail order |
| `payment.events` | `PaymentProcessed` | Confirm order |
| `payment.events` | `PaymentFailed` | Release stock + fail order |

### Write Model

```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'created',
  -- Saga states: created, stock_reserved, payment_processing,
  --              confirmed, failed, cancelled
  subtotal DECIMAL(10,2) NOT NULL,
  tax DECIMAL(10,2) DEFAULT 0,
  shipping DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  shipping_address JSONB NOT NULL,
  tenant_id UUID NOT NULL,
  saga_status VARCHAR(30),       -- Track saga state
  failure_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  product_id UUID NOT NULL,
  product_name VARCHAR(255) NOT NULL,     -- Snapshot
  product_price DECIMAL(10,2) NOT NULL,   -- Snapshot
  quantity INTEGER NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_tenant ON orders(tenant_id);
CREATE INDEX idx_order_items_order ON order_items(order_id);
```

### Saga Orchestrator

```
                   ┌─────────────────────────┐
                   │    Order Service         │
                   │    (Saga Orchestrator)   │
                   └────────┬────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   Step 1              Step 2              Step 3
   ReserveStock        ProcessPayment     ConfirmOrder
        │                   │                   │
        ▼                   ▼                   ▼
   ┌──────────┐       ┌──────────┐       ┌──────────┐
   │Inventory │       │ Payment  │       │  Notify  │
   │ Service  │       │ Service  │       │ Service  │
   └──────────┘       └──────────┘       └──────────┘

   Compensations:
   ────────────
   If Payment fails → ReleaseStock command to Inventory
   If Stock fails   → Mark order FAILED (nothing to compensate)
```

---

## 4.9 Payment Service

### Overview

| Property | Value |
|----------|-------|
| **Context** | Payment |
| **Database** | PostgreSQL |
| **Port** | 3008 |

### Responsibility

- Process payments (Stripe, PayPal integration)
- Handle refunds
- Payment state management
- Saga participant (process payment on command)

### APIs

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/payments` | Internal | Process payment (from Saga) |
| GET | `/payments/:id` | Yes | Get payment status |
| POST | `/payments/:id/refund` | Admin | Initiate refund |

### Events Published

| Topic | Event | When |
|-------|-------|------|
| `payment.events` | `PaymentProcessed` | Payment successful |
| `payment.events` | `PaymentFailed` | Payment failed |
| `payment.events` | `RefundProcessed` | Refund completed |

### Events Consumed

| Topic | Event | Action |
|-------|-------|--------|
| `order.events` | `ProcessPayment` | Process payment for order |

### Write Model

```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  user_id UUID NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- pending, processing, completed, failed, refunded
  provider VARCHAR(20) NOT NULL,         -- stripe, paypal
  provider_transaction_id VARCHAR(255),
  provider_response JSONB,
  failure_reason TEXT,
  tenant_id UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID REFERENCES payments(id),
  amount DECIMAL(10,2) NOT NULL,
  reason TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_user ON payments(user_id);
```

---

## 4.10 Notification Service

### Overview

| Property | Value |
|----------|-------|
| **Context** | Engagement |
| **Database** | None (stateless consumer) |
| **Port** | 3009 |

### Responsibility

- Send email notifications (order confirmation, shipping updates)
- Send SMS notifications
- Push notifications (future)
- Template management

### Events Consumed

| Topic | Event | Action |
|-------|-------|--------|
| `order.events` | `OrderConfirmed` | Send order confirmation email |
| `order.events` | `OrderFailed` | Send order failure notification |
| `order.events` | `OrderCancelled` | Send cancellation confirmation |
| `user.events` | `UserRegistered` | Send welcome email |
| `payment.events` | `RefundProcessed` | Send refund notification |

### No APIs Exposed

Notification Service is a pure event consumer. It has no REST API (except `/health`).

### Integration

```
Notification Service
  ├── Email: AWS SES / SendGrid
  ├── SMS: AWS SNS / Twilio
  └── Push: Firebase Cloud Messaging (future)
```

---

## 4.11 Complete Event Flow Diagram

```
┌──────────┐    registers    ┌──────────┐    UserRegistered    ┌──────────┐
│  Client  │ ──────────────► │   Auth   │ ──────────────────► │   User   │
│          │                 │ Service  │                      │ Service  │
└──────────┘                 └──────────┘                      └──────────┘
     │                                                              │
     │ creates product                                         UserRegistered
     │                                                              │
     ▼                                                              ▼
┌──────────┐  ProductCreated  ┌──────────┐                   ┌──────────┐
│ Product  │ ───────────────► │  Search  │                   │  Notif.  │
│ Service  │  ProductUpdated  │ Service  │                   │ Service  │
│          │  ProductDeleted  │          │                   │          │
└──────────┘                  └──────────┘                   └──────────┘
     │                                                           ▲
     │ ProductCreated                                           │
     ▼                                                          │
┌──────────┐                                                    │
│Inventory │                                                    │
│ Service  │                                                    │
└──────────┘                                                    │
     ▲                                                          │
     │ ReserveStock / ReleaseStock                              │
     │                                                          │
┌────┴─────┐  checkout   ┌──────────┐  ProcessPayment  ┌───────┴──┐
│   Cart   │ ──────────► │  Order   │ ────────────────► │ Payment  │
│ Service  │             │ Service  │                   │ Service  │
│          │             │ (Saga)   │                   │          │
└──────────┘             └────┬─────┘                   └──────────┘
                              │
                    OrderConfirmed / OrderFailed
                              │
                              ▼
                        ┌──────────┐
                        │  Notif.  │
                        │ Service  │
                        └──────────┘
```

---

## Common Mistakes

> [!CAUTION]
> - **Synchronous calls between services during writes.** Order Service should NOT call
>   Inventory Service via HTTP to reserve stock. Use the Saga pattern via events.
> - **Not storing price snapshots in orders.** If Product Service changes a price, existing
>   orders should still show the price at the time of purchase.
> - **Cart depending on Product Service for reads.** Cart should store product name/price
>   as snapshots. Validate freshness lazily, not on every read.
> - **Missing compensation logic.** If your Saga has a "reserve stock" step, you MUST have
>   a "release stock" compensation. Otherwise failures leave stock permanently reserved.

---

> **Next →** [Phase 5 — Event-Driven Architecture](./phase-05-event-driven-architecture.md)
