# Request Flows

> **Purpose:** Trace every type of HTTP request from the frontend through the entire backend stack.
> Use this to understand how data moves through the system and to debug production issues.

---

## Flow Legend

```
──► Synchronous HTTP call
~~► Asynchronous Kafka event (via Outbox)
[DB] Database operation
[Cache] Redis cache operation
[ES] OpenSearch operation
```

---

## 1. User Registration

```
Client                 API Gateway          Auth Service             User Service        Notification
  │                       │                     │                       │                    │
  │ POST /api/auth/register                     │                       │                    │
  │──────────────────────►│                     │                       │                    │
  │                       │ POST /auth/register │                       │                    │
  │                       │────────────────────►│                       │                    │
  │                       │                     │ Hash password (bcrypt) │                    │
  │                       │                     │ [DB] Save credentials  │                    │
  │                       │                     │ [DB] Save to Outbox:   │                    │
  │                       │                     │   UserRegistered       │                    │
  │                       │  201 + JWT          │                       │                    │
  │                       │◄────────────────────│                       │                    │
  │  201 + JWT            │                     │                       │                    │
  │◄──────────────────────│                     │                       │                    │
  │                       │                     │                       │                    │
  │                       │             [Outbox Relay polls every 5s]   │                    │
  │                       │                     │ ~~ UserRegistered ~~► │                    │
  │                       │                     │                       │ [DB] Create profile│
  │                       │                     │                       │                    │
  │                       │                     │ ~~ UserRegistered ~~~~~~~~~~~~~~~~~~────► │
  │                       │                     │                       │    Send welcome    │
  │                       │                     │                       │    email           │
```

---

## 2. User Login

```
Client                 API Gateway          Auth Service
  │                       │                     │
  │ POST /api/auth/login  │                     │
  │──────────────────────►│                     │
  │                       │ POST /auth/login    │
  │                       │────────────────────►│
  │                       │                     │ [DB] Find user by email
  │                       │                     │ Verify password (bcrypt)
  │                       │                     │ Generate JWT (RS256):
  │                       │                     │   { userId, tenantId, roles, exp }
  │                       │                     │ [Cache] Store refresh token
  │                       │  200 + tokens       │
  │                       │◄────────────────────│
  │  200 + tokens         │                     │
  │◄──────────────────────│                     │
```

---

## 3. Browse Products (with Cache)

```
Client                 API Gateway          Product Service
  │                       │                     │
  │ GET /api/products?page=1&limit=20           │
  │──────────────────────►│                     │
  │                       │ Validate JWT        │
  │                       │ Generate correlation ID
  │                       │ GET /products       │
  │                       │────────────────────►│
  │                       │                     │ [Cache] Check products:list:{hash}
  │                       │                     │   ├── HIT → return cached
  │                       │                     │   └── MISS:
  │                       │                     │     [DB] SELECT * FROM products
  │                       │                     │           WHERE tenant_id = :tenantId
  │                       │                     │           ORDER BY created_at DESC
  │                       │                     │           LIMIT 20 OFFSET 0
  │                       │                     │     [Cache] SET products:list:{hash} TTL=60s
  │                       │  200 + products     │
  │                       │◄────────────────────│
  │  200 + products       │                     │
  │◄──────────────────────│                     │
```

---

## 4. Search Products

```
Client                 API Gateway          Search Service
  │                       │                     │
  │ GET /api/search?q=headphones&category=electronics
  │──────────────────────►│                     │
  │                       │ GET /search?q=...   │
  │                       │────────────────────►│
  │                       │                     │ [ES] Query OpenSearch:
  │                       │                     │   multi_match: "headphones"
  │                       │                     │   filter: category = "electronics"
  │                       │                     │   aggregations: brands, price ranges
  │                       │  200 + results      │
  │                       │◄────────────────────│
  │  200 + results + facets                     │
  │◄──────────────────────│                     │
```

---

## 5. Add to Cart

```
Client                 API Gateway          Cart Service
  │                       │                     │
  │ POST /api/cart/items  │                     │
  │ { productId, qty }    │                     │
  │──────────────────────►│                     │
  │                       │ Validate JWT        │
  │                       │ POST /cart/items    │
  │                       │────────────────────►│
  │                       │                     │ [Cache] HGET cart:{userId}
  │                       │                     │ Add item with price snapshot
  │                       │                     │ Recalculate subtotal
  │                       │                     │ [Cache] HSET cart:{userId}
  │                       │                     │ [Cache] EXPIRE cart:{userId} 7d
  │                       │  200 + cart         │
  │                       │◄────────────────────│
  │  200 + cart           │                     │
  │◄──────────────────────│                     │
```

---

## 6. Checkout (Saga Flow) — The Most Complex Flow

```
Client          API Gateway      Order Svc        Inventory Svc    Payment Svc     Notification
  │                │                │                  │                │               │
  │ POST /api/orders               │                  │                │               │
  │───────────────►│               │                  │                │               │
  │                │ POST /orders  │                  │                │               │
  │                │──────────────►│                  │                │               │
  │                │               │ [DB] Create order (CREATED)      │               │
  │                │               │ [DB] Create order items          │               │
  │                │               │ [DB] Save outbox: ReserveStock   │               │
  │                │  201 + order  │                  │                │               │
  │                │◄──────────────│                  │                │               │
  │  201 + order   │               │                  │                │               │
  │◄───────────────│               │                  │                │               │
  │                │               │                  │                │               │
  │                │        [Outbox Relay]            │                │               │
  │                │               │ ~~ ReserveStock ~~~►             │               │
  │                │               │                  │ [Inbox] Check dedup            │
  │                │               │                  │ [DB] OCC: reserve stock        │
  │                │               │                  │ [DB] Create reservation        │
  │                │               │                  │ [DB] Save outbox: StockReserved│
  │                │               │                  │                │               │
  │                │               │ ◄~~ StockReserved ~~             │               │
  │                │               │ [DB] Update order: STOCK_RESERVED│               │
  │                │               │ [DB] Save outbox: ProcessPayment │               │
  │                │               │                  │                │               │
  │                │               │                  │  ~~ ProcessPayment ~~►        │
  │                │               │                  │                │ [Inbox] Check │
  │                │               │                  │                │ Call Stripe API│
  │                │               │                  │                │ [DB] Save pay │
  │                │               │                  │                │ [DB] Outbox:  │
  │                │               │                  │                │  PaymentProcessed
  │                │               │                  │                │               │
  │                │               │ ◄~~ PaymentProcessed ~~         │               │
  │                │               │ [DB] Update order: CONFIRMED     │               │
  │                │               │ [DB] Save outbox: OrderConfirmed │               │
  │                │               │                  │                │               │
  │                │               │ ~~~~~~ OrderConfirmed ~~~~~~~~~~~~~~~~~~~~────► │
  │                │               │                  │                │  Send email   │
```

### Checkout Failure Path (Payment Declined)

```
  Payment Service receives ProcessPayment
    │ Stripe returns: card_declined
    │ [DB] Save payment (FAILED)
    │ [DB] Outbox: PaymentFailed
    │
    ▼
  Order Service receives PaymentFailed
    │ [DB] Update order: COMPENSATING
    │ [DB] Outbox: ReleaseStock (compensation)
    │
    ▼
  Inventory Service receives ReleaseStock
    │ [DB] Release reserved stock
    │ [DB] Delete reservation
    │ [DB] Outbox: StockReleased
    │
    ▼
  Order Service receives StockReleased
    │ [DB] Update order: FAILED
    │ [DB] Outbox: OrderFailed
    │
    ▼
  Notification Service receives OrderFailed
    │ Send failure email to customer
```

---

## 7. Product CRUD → Search Sync (CQRS)

```
Admin                  Product Service        Outbox Relay         Search Service
  │                       │                       │                    │
  │ POST /products        │                       │                    │
  │──────────────────────►│                       │                    │
  │                       │ [DB] INSERT product   │                    │
  │                       │ [DB] INSERT outbox:   │                    │
  │                       │   ProductCreated      │                    │
  │  201                  │                       │                    │
  │◄──────────────────────│                       │                    │
  │                       │                       │                    │
  │                       │            [polls every 5s]               │
  │                       │                       │ Kafka: product.events
  │                       │                       │───────────────────►│
  │                       │                       │                    │ [Inbox] Dedup check
  │                       │                       │                    │ [ES] Index document
  │                       │                       │                    │ [Inbox] Mark PROCESSED
  │                       │                       │                    │
  │ GET /search?q=product-name                    │                    │
  │───────────────────────────────────────────────────────────────────►│
  │                       │                       │                    │ [ES] Full-text query
  │  200 + results        │                       │                    │
  │◄──────────────────────────────────────────────────────────────────│
```
