# Event Catalog

> **Purpose:** Every domain event in the system — its schema, topic, publisher, consumers,
> and version. Consult this before publishing or consuming any event.

---

## Event Naming Convention

```
Format:  {domain}.{entity}.{action}.v{version}
Topic:   {domain}.events (one topic per domain)
Key:     Entity ID (ensures ordering per entity)

Examples:
  product.created.v1    on topic: product.events    key: productId
  order.confirmed.v1    on topic: order.events      key: orderId
  inventory.stock-reserved.v1  on topic: inventory.events  key: orderId
```

---

## Event Envelope (Standard)

Every event is wrapped in this envelope:

```typescript
interface EventEnvelope<T> {
  eventId: string;           // UUID — unique per event (deduplication key)
  eventType: string;         // "product.created"
  version: number;           // Schema version
  timestamp: string;         // ISO 8601
  source: string;            // "product-service"
  correlationId: string;     // Request trace ID
  tenantId: string;          // Multi-tenant ID
  metadata?: Record<string, any>;
  payload: T;                // Domain-specific data
}
```

---

## Kafka Topics

| Topic | Partitions | Replication | Retention | Key |
|-------|-----------|-------------|-----------|-----|
| `product.events` | 6 | 3 | 7 days | productId |
| `order.events` | 12 | 3 | 30 days | orderId |
| `inventory.events` | 6 | 3 | 7 days | orderId |
| `payment.events` | 6 | 3 | 30 days | orderId |
| `user.events` | 3 | 3 | 7 days | userId |
| `cart.events` | 3 | 3 | 3 days | userId |
| `notification.events` | 3 | 3 | 3 days | userId |
| `*.events.dlq` | 1 | 3 | 30 days | original key |

---

## All Events

### User Domain

| Event | Version | Publisher | Consumers | Trigger |
|-------|---------|-----------|-----------|---------|
| `user.registered` | v1 | Auth Service | User Service, Notification Service | After successful registration |
| `user.profile-updated` | v1 | User Service | — | Profile fields changed |
| `user.deactivated` | v1 | User Service | — | Account deactivated |

```typescript
// user.registered.v1
interface UserRegisteredPayload {
  userId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: 'customer' | 'admin';
}
```

---

### Product Domain

| Event | Version | Publisher | Consumers | Trigger |
|-------|---------|-----------|-----------|---------|
| `product.created` | v1 | Product Service | Search Service, Inventory Service | Product added |
| `product.updated` | v1 | Product Service | Search Service | Product fields changed |
| `product.deleted` | v1 | Product Service | Search Service | Soft delete |
| `product.price-changed` | v1 | Product Service | Search Service | Price updated |

```typescript
// product.created.v1
interface ProductCreatedPayload {
  id: string;
  name: string;
  description: string;
  sku: string;
  price: number;
  currency: string;
  categoryId: string;
  categoryName: string;
  brand: string;
  images: string[];
  tags: string[];
  status: 'draft' | 'active' | 'archived';
}
```

---

### Order Domain

| Event | Version | Publisher | Consumers | Trigger |
|-------|---------|-----------|-----------|---------|
| `order.created` | v1 | Order Service | — | Order placed |
| `order.reserve-stock` | v1 | Order Service | Inventory Service | Saga step 1 command |
| `order.process-payment` | v1 | Order Service | Payment Service | Saga step 2 command |
| `order.release-stock` | v1 | Order Service | Inventory Service | Saga compensation |
| `order.confirmed` | v1 | Order Service | Notification Service | Saga completed |
| `order.failed` | v1 | Order Service | Notification Service | Saga failed |
| `order.cancelled` | v1 | Order Service | Notification Service, Inventory Service | User cancelled |

```typescript
// order.created.v1
interface OrderCreatedPayload {
  orderId: string;
  userId: string;
  items: Array<{
    productId: string;
    productName: string;
    price: number;
    quantity: number;
  }>;
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  currency: string;
  shippingAddress: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
}
```

---

### Inventory Domain

| Event | Version | Publisher | Consumers | Trigger |
|-------|---------|-----------|-----------|---------|
| `inventory.stock-reserved` | v1 | Inventory Service | Order Service | Stock locked for order |
| `inventory.stock-reservation-failed` | v1 | Inventory Service | Order Service | Insufficient stock |
| `inventory.stock-released` | v1 | Inventory Service | Order Service | Reserved stock freed |
| `inventory.stock-level-changed` | v1 | Inventory Service | — | Admin stock update |

```typescript
// inventory.stock-reserved.v1
interface StockReservedPayload {
  orderId: string;
  reservations: Array<{
    productId: string;
    quantity: number;
    reservationId: string;
  }>;
}
```

---

### Payment Domain

| Event | Version | Publisher | Consumers | Trigger |
|-------|---------|-----------|-----------|---------|
| `payment.processed` | v1 | Payment Service | Order Service | Payment successful |
| `payment.failed` | v1 | Payment Service | Order Service | Payment declined/error |
| `payment.refund-processed` | v1 | Payment Service | Notification Service | Refund completed |

```typescript
// payment.processed.v1
interface PaymentProcessedPayload {
  paymentId: string;
  orderId: string;
  amount: number;
  currency: string;
  provider: 'stripe' | 'paypal';
  transactionId: string;
}
```

---

### Cart Domain

| Event | Version | Publisher | Consumers | Trigger |
|-------|---------|-----------|-----------|---------|
| `cart.checked-out` | v1 | Cart Service | — (future analytics) | User initiates checkout |

---

## Consumer Groups

| Consumer Group | Service | Topic | Purpose |
|---------------|---------|-------|---------|
| `search-indexer` | Search | `product.events` | Index products in OpenSearch |
| `inventory-init` | Inventory | `product.events` | Init stock records for new products |
| `user-profile-init` | User | `user.events` | Create profile on registration |
| `inventory-saga` | Inventory | `order.events` | Reserve/release stock (saga) |
| `payment-saga` | Payment | `order.events` | Process payment (saga) |
| `order-saga-inventory` | Order | `inventory.events` | Handle stock reservation results |
| `order-saga-payment` | Order | `payment.events` | Handle payment results |
| `notification-order` | Notification | `order.events` | Send order notifications |
| `notification-user` | Notification | `user.events` | Send welcome email |
| `notification-payment` | Notification | `payment.events` | Send refund notification |

---

## Event Versioning Rules

| Change Type | Version Bump? | Backward Compatible? |
|-------------|--------------|---------------------|
| Add optional field | No | ✅ Yes |
| Add required field | Yes (v1→v2) | ❌ No |
| Remove field | Yes (v1→v2) | ❌ No |
| Rename field | Yes (v1→v2) | ❌ No |
| Change field type | Yes (v1→v2) | ❌ No |

When bumping versions, consumers must handle both v1 and v2 during the migration window.
