# Section 4 — Request Flow

## User Login Flow

```
Client                 API Gateway           Auth Service              PostgreSQL        Redis
  │                        │                       │                       │               │
  │  POST /auth/login      │                       │                       │               │
  │  {email, password}     │                       │                       │               │
  │───────────────────────>│                       │                       │               │
  │                        │  @Public() — no JWT   │                       │               │
  │                        │  Forward POST         │                       │               │
  │                        │──────────────────────>│                       │               │
  │                        │                       │  LoginQuery dispatched │               │
  │                        │                       │──────────────────────>│               │
  │                        │                       │  SELECT user WHERE    │               │
  │                        │                       │  email = ?            │               │
  │                        │                       │<──────────────────────│               │
  │                        │                       │                       │               │
  │                        │                       │  bcrypt.compare(pwd)  │               │
  │                        │                       │                       │               │
  │                        │                       │  Generate access JWT  │               │
  │                        │                       │  (15min, contains     │               │
  │                        │                       │   sub, email, roles)  │               │
  │                        │                       │                       │               │
  │                        │                       │  Generate refresh     │               │
  │                        │                       │  token (UUID)         │               │
  │                        │                       │──────────────────────────────────────>│
  │                        │                       │  SET refresh:{uid}:{tid} EX 604800    │
  │                        │                       │  SADD sessions:{uid} {tid}            │
  │                        │                       │<──────────────────────────────────────│
  │                        │                       │                       │               │
  │                        │  {accessToken,        │                       │               │
  │                        │   refreshToken}       │                       │               │
  │                        │<──────────────────────│                       │               │
  │  200 OK                │                       │                       │               │
  │  {accessToken,         │                       │                       │               │
  │   refreshToken}        │                       │                       │               │
  │<───────────────────────│                       │                       │               │
```

## Checkout Flow (Saga)

```
Client     API GW    Cart Svc    Order Svc     Kafka     Inventory Svc    Payment Svc    Notification
  │          │          │            │           │             │               │               │
  │ POST     │          │            │           │             │               │               │
  │/orders   │          │            │           │             │               │               │
  │─────────>│          │            │           │             │               │               │
  │          │ Forward  │            │           │             │               │               │
  │          │─────────────────────>│            │             │               │               │
  │          │          │            │           │             │               │               │
  │          │          │   CreateOrderCommand   │             │               │               │
  │          │          │   ┌────────────────┐   │             │               │               │
  │          │          │   │ 1. Create Order│   │             │               │               │
  │          │          │   │    aggregate   │   │             │               │               │
  │          │          │   │ 2. Persist to  │   │             │               │               │
  │          │          │   │    PostgreSQL  │   │             │               │               │
  │          │          │   │ 3. Write outbox│   │             │               │               │
  │          │          │   │    (atomic)    │   │             │               │               │
  │          │          │   └────────────────┘   │             │               │               │
  │          │          │            │           │             │               │               │
  │  201     │          │            │  Outbox   │             │               │               │
  │<─────────│          │            │  relay    │             │               │               │
  │          │          │            │──────────>│             │               │               │
  │          │          │            │ order.    │             │               │               │
  │          │          │            │ created   │             │               │               │
  │          │          │            │           │────────────>│               │               │
  │          │          │            │           │  OrderEvent │               │               │
  │          │          │            │           │  Consumer   │               │               │
  │          │          │            │           │  ┌─────────────────┐        │               │
  │          │          │            │           │  │ ReserveStock    │        │               │
  │          │          │            │           │  │ (OCC + lock)    │        │               │
  │          │          │            │           │  │ Check available │        │               │
  │          │          │            │           │  │ Decrement avail │        │               │
  │          │          │            │           │  │ Increment resv  │        │               │
  │          │          │            │           │  └─────────────────┘        │               │
  │          │          │            │           │<────────────│               │               │
  │          │          │            │           │ inventory.  │               │               │
  │          │          │            │           │ reserved    │               │               │
  │          │          │            │<──────────│             │               │               │
  │          │          │            │           │             │               │               │
  │          │          │  CheckoutSagaOrchestrator           │               │               │
  │          │          │  ┌──────────────────────┐           │               │               │
  │          │          │  │ order.requestPayment()           │               │               │
  │          │          │  │ → PENDING_PAYMENT    │           │               │               │
  │          │          │  │ paymentService       │           │               │               │
  │          │          │  │   .requestPayment()  │──────────────────────────>│               │
  │          │          │  └──────────────────────┘           │               │               │
  │          │          │            │           │             │  ┌────────────────────┐       │
  │          │          │            │           │             │  │ ProcessPayment     │       │
  │          │          │            │           │             │  │ Create Payment     │       │
  │          │          │            │           │             │  │ → PROCESSING       │       │
  │          │          │            │           │             │  │ → SUCCESS          │       │
  │          │          │            │           │             │  │ Persist + outbox   │       │
  │          │          │            │           │             │  └────────────────────┘       │
  │          │          │            │           │<──────────────────────────│               │
  │          │          │            │           │ payment.    │               │               │
  │          │          │            │           │ processed   │               │               │
  │          │          │            │<──────────│             │               │               │
  │          │          │            │           │             │               │               │
  │          │          │  ConfirmPaymentHandler │             │               │               │
  │          │          │  ┌──────────────────────┐           │               │               │
  │          │          │  │ order.confirmPayment()           │               │               │
  │          │          │  │ → PAID               │           │               │               │
  │          │          │  └──────────────────────┘           │               │               │
  │          │          │            │           │             │               │               │
  │          │          │            │           │────────────────────────────────────────────>│
  │          │          │            │           │ order.      │               │   OrderEvent   │
  │          │          │            │           │ completed   │               │   Consumer     │
  │          │          │            │           │             │               │   → Send email │
```

## Compensation Flow (Payment Fails)

```
Payment Service            Kafka              Order Service           Inventory Service
      │                      │                      │                       │
      │  payment.failed      │                      │                       │
      │─────────────────────>│                      │                       │
      │                      │─────────────────────>│                       │
      │                      │                      │                       │
      │                      │    CancelOrderHandler│                       │
      │                      │    ┌────────────────────┐                    │
      │                      │    │ order.cancel()     │                    │
      │                      │    │ → CANCELLED        │                    │
      │                      │    │ Persist + outbox   │                    │
      │                      │    └────────────────────┘                    │
      │                      │                      │                       │
      │                      │                      │  order.cancelled      │
      │                      │                      │──────────────────────>│
      │                      │                      │                       │
      │                      │                      │   ReleaseStockCommand │
      │                      │                      │   ┌──────────────────────┐
      │                      │                      │   │ release reserved  │
      │                      │                      │   │ stock back to     │
      │                      │                      │   │ available pool    │
      │                      │                      │   └──────────────────────┘
```

---

# Section 5 — Event-Driven Architecture

## Kafka Topics

| Topic | Producer | Consumers | Purpose |
|-------|----------|-----------|---------|
| `order.created` | Order Service | Inventory Service | Trigger stock reservation |
| `order.updated` | Order Service | Notification Service | Status change notifications |
| `order.cancelled` | Order Service | Inventory Service, Notification Service | Release stock + notify user |
| `order.completed` | Order Service | Notification Service | Order confirmation email |
| `product.created` | Product Service | Search Service | Index new product |
| `product.updated` | Product Service | Search Service | Update search index |
| `product.deleted` | Product Service | Search Service | Remove from index |
| `product.stock_updated` | Product Service | Search Service | Update stock info in index |
| `inventory.reserved` | Inventory Service | Order Service (Saga) | Trigger payment request |
| `inventory.reservation_failed` | Inventory Service | Order Service (Saga) | Cancel order |
| `inventory.released` | Inventory Service | (logging) | Audit trail |
| `payment.processed` | Payment Service | Order Service (Saga) | Confirm payment on order |
| `payment.failed` | Payment Service | Order Service (Saga) | Cancel order |
| `cart.item_added` | Cart Service | (analytics) | Cart analytics |
| `cart.item_removed` | Cart Service | (analytics) | Cart analytics |
| `cart.cleared` | Cart Service | (analytics) | Cart analytics |
| `cart.expired` | Cart Service | Inventory Service | Release cart reservations |
| `user.created` | User/Auth Service | Notification Service | Welcome email |
| `user.updated` | User Service | (downstream) | Profile sync |
| `user.deleted` | User Service | (downstream) | Cleanup |
| `user.suspended` | User Service | (downstream) | Access revocation |
| `notification.sent` | Notification Service | (audit) | Delivery confirmation |
| `notification.failed` | Notification Service | (DLQ) | Failed delivery tracking |

## Event Envelope Schema

All events conform to this Zod-validated envelope:

```typescript
{
  type: string,           // e.g., "order.created"
  schemaVersion: number,  // e.g., 1 — enables schema evolution
  source: string,         // e.g., "order-service"
  correlationId?: string, // UUID for distributed tracing
  timestamp: string,      // ISO-8601 datetime
  payload: Record<string, unknown>
}
```

## Event Contract Examples

**OrderCreatedEvent**:
```typescript
{
  orderId: string,
  userId: string,
  items: [{ productId: string, quantity: number, price: number }],
  totalAmount: number,
  schemaVersion: 1,
  header: { timestamp: string, correlationId: string }
}
```

**InventoryReservedEvent**:
```typescript
{
  orderId: string,
  items: [{ productId: string, quantity: number }],
  schemaVersion: 1,
  header: { timestamp: string, correlationId: string }
}
```

**PaymentProcessedEvent**:
```typescript
{
  orderId: string,
  paymentId: string,
  amount: number,
  status: "SUCCESS",
  schemaVersion: 1,
  header: { timestamp: string, correlationId: string }
}
```

## Checkout Event Flow

```
order.created ─────────────────────→ inventory.reserved ──────────→ payment.processed
     │                                      │                              │
     │                                      │                              │
     │                         (if stock insufficient)              (if payment fails)
     │                                      │                              │
     │                          inventory.reservation_failed       payment.failed
     │                                      │                              │
     └──────── order.cancelled ←────────────┴──────────────────────────────┘
                     │
                     └──→ inventory.released (compensation)
```

## Transactional Outbox Pattern

Event publishing uses the **Transactional Outbox** pattern to guarantee atomicity:

1. Business operation + outbox entry are written in a **single database transaction**
2. `UnitOfWork.execute(work, events)` wraps both in `DataSource.transaction()`
3. Outbox entry: `{ id: UUID, type: string, payload: JSONB, processed: false, createdAt: timestamp }`
4. `OutboxRelayService` polls unprocessed entries, publishes to Kafka, marks `processed = true`

This ensures **at-least-once delivery** without distributed locking between the DB and Kafka.
