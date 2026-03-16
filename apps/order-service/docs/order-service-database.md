# Order Service Database Schema

## Tables

### orders
| Column | Type | Constraint | Index |
|--------|------|-----------|-------|
| id | uuid | PK | ✅ |
| userId | varchar(255) | NOT NULL | ✅ |
| status | varchar(50) | NOT NULL | ✅ |
| totalAmount | decimal(12,2) | NOT NULL | |
| currency | varchar(3) | DEFAULT 'USD' | |
| version | integer | NOT NULL | |
| createdAt | timestamptz | AUTO | ✅ |
| updatedAt | timestamptz | AUTO | |

**Composite Index:** `(userId, status)` — optimizes "get orders by user filtered by status"

### order_items
| Column | Type | Constraint | Index |
|--------|------|-----------|-------|
| id | uuid | PK (auto) | ✅ |
| orderId | uuid | FK → orders.id | ✅ |
| productId | varchar(255) | NOT NULL | ✅ |
| productName | varchar(255) | NOT NULL | |
| quantity | integer | NOT NULL | |
| unitPrice | decimal(12,2) | NOT NULL | |
| currency | varchar(3) | DEFAULT 'USD' | |

**ON DELETE CASCADE:** Deleting an order cascades to its items.

### outbox_events
| Column | Type | Constraint |
|--------|------|-----------|
| id | uuid | PK |
| type | varchar(100) | NOT NULL |
| payload | jsonb | NOT NULL |
| processed | boolean | DEFAULT false |
| createdAt | timestamptz | AUTO |

### processed_events
| Column | Type | Constraint |
|--------|------|-----------|
| eventId | varchar | PK |
| processedAt | timestamptz | AUTO |

## Optimistic Concurrency Control

The `orders.version` column uses TypeORM's `@VersionColumn()`. On every update, TypeORM automatically:
1. Includes `WHERE version = current_version` in the UPDATE
2. Increments version by 1
3. Throws `OptimisticLockVersionMismatchError` if the row was modified by another transaction

## Indexing Strategy

| Query Pattern | Index Used |
|--------------|-----------|
| Get order by ID | PK (orders.id) |
| Get orders by user | orders.userId |
| Get orders by status | orders.status |
| Get orders by user + status | Composite (userId, status) |
| Get recent orders | orders.createdAt |
| Get items by order | order_items.orderId |
| Find item by product | order_items.productId |
