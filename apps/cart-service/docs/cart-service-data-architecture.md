# Cart Service — Data Architecture

> Data layer design for the `cart-service` microservice.  
> Last updated: 2026-03-15 — reflects production-ready state.

---

## 1. Primary Store: Redis

The cart-service uses **Redis as its primary data store**. Carts are stored as JSON strings with a 30-day TTL, keyed by `userId`. Optimistic locking is implemented via `WATCH`/`MULTI`/`EXEC`.

### Key Pattern & Schema

| Key | Format | TTL |
|-----|--------|-----|
| `cart:data:{userId}` | JSON string | 30 days (2,592,000s) |

```typescript
// src/infrastructure/persistence/cart.schema.ts
interface CartDocument {
  id: string;
  userId: string;
  items: CartItemDocument[];
  version: number;            // Optimistic locking counter
  createdAt: string;          // ISO 8601
  expiresAt: string;          // ISO 8601, auto-refreshed on every mutation
}

interface CartItemDocument {
  productId: string;
  quantity: number;
  snapshottedPrice: number;
}
```

### Optimistic Locking Flow

```mermaid
sequenceDiagram
    participant Handler
    participant Redis

    Handler->>Redis: WATCH cart:data:{userId}
    Handler->>Redis: GET cart:data:{userId}
    Redis-->>Handler: CartDocument (version=5)
    
    Note over Handler: Load domain entity, apply mutations

    Handler->>Redis: MULTI
    Handler->>Redis: SET cart:data:{userId} {..., version: 6}
    Handler->>Redis: EXPIRE cart:data:{userId} 2592000
    Handler->>Redis: EXEC

    alt No concurrent modification
        Redis-->>Handler: [OK, OK] — success
        Note over Handler: cart.incrementVersion()
    else Concurrent modification detected
        Redis-->>Handler: null — WATCH triggered
        Note over Handler: Throw VersionConflictException (→ 409)
    end
```

### Why Redis (not MongoDB/PostgreSQL)?

| Criterion | Redis | MongoDB |
|-----------|-------|---------|
| Latency | Sub-millisecond | ~1-5ms |
| Already in infra | ✅ yes (docker-compose) | ❌ not provisioned |
| Cart workload fit | ✅ ephemeral, key-value | ✅ document store |
| TTL native support | ✅ `EXPIRE` command | ✅ TTL index |
| Optimistic locking | ✅ `WATCH/MULTI/EXEC` | ✅ `findOneAndUpdate` |
| Horizontal scaling | Redis Cluster | MongoDB sharding |

---

## 2. Redis Cache Layer

Separate from the primary store, the cache layer provides read optimization.

| Property | Value |
|----------|-------|
| Key pattern | `cart:{userId}` (note: no `data:` prefix) |
| TTL | 3,600 seconds (1 hour) |
| Serialisation | `JSON.stringify(cart.toJSON())` |
| Reconstitution | `Cart.reconstitute()` with validated VOs |
| Write strategy | **Write-through**: every command handler calls `cache.set(userId, cart)` after `repo.save()` |
| Read strategy | **Cache-first**: `GetCartHandler` checks cache first; on miss, reads from primary store and warms cache |

### Cache Flow

```mermaid
flowchart TD
    A[GET /v1/cart/:userId] --> B{Cache HIT?}
    B -->|Yes ~0.1ms| C[Return cached cart.toJSON]
    B -->|No| D[Load from Primary Store]
    D --> E{Cart exists?}
    E -->|Yes| F[cache.set userId, cart]
    F --> G[Return cart.toJSON]
    E -->|No| H[Return empty cart]

    I[POST / PATCH / DELETE] --> J[repo.save cart — WATCH/MULTI/EXEC]
    J --> K[cache.set userId, cart — write-through]
    K --> L[outbox.append events — XADD]
```

---

## 3. Event Outbox: Redis Streams

Events are durably stored in a Redis Stream before being relayed to Kafka — implementing the **Transactional Outbox** pattern.

### Stream Key

| Key | Format |
|-----|--------|
| `cart:outbox:stream` | Redis Stream entries: `eventType` + `payload` fields |

### Consumer Group

| Group | Consumer | Block | Count |
|-------|----------|-------|-------|
| `cart-relay` | `relay-worker-1` | 2000ms | 10 per poll |

### Outbox Flow

```mermaid
sequenceDiagram
    participant Handler as Command Handler
    participant Outbox as Redis Stream (cart:outbox:stream)
    participant Relay as OutboxRelayService
    participant Kafka

    Handler->>Outbox: XADD * eventType "cart.item_added" payload "{...}"
    
    loop Every ~1s
        Relay->>Outbox: XREADGROUP GROUP cart-relay relay-worker-1 COUNT 10
        Outbox-->>Relay: [messageId, eventType, payload]
        Relay->>Kafka: producer.send({ topic, key: userId, value: payload })
        alt Kafka publish succeeds
            Relay->>Outbox: XACK cart:outbox:stream cart-relay messageId
        else Kafka unavailable
            Note over Relay: No ACK → retried on next poll
        end
    end
```

### Guarantees

| Property | Guarantee |
|----------|-----------|
| Durability | Events survive process restarts (Redis persistence) |
| Delivery | **At-least-once** (ACK after Kafka publish) |
| Ordering | Per-partition ordering in Kafka (key = `userId`) |
| Deduplication | Each event has a unique `eventId` (UUID) for downstream idempotency |

---

## 4. Cart Expiration Strategy

### TTL Layers

| Layer | TTL | Mechanism |
|-------|-----|-----------|
| **Redis Cache** | 1 hour | `SETEX cart:{userId} 3600 ...` |
| **Redis Primary** | 30 days | `EXPIRE cart:data:{userId} 2592000` — refreshed on every write |
| **Domain Entity** | 30 days | `expiresAt` field auto-refreshed in `Cart.refreshExpiry()` on every mutation |

### Cart Lifecycle

```mermaid
timeline
    title Cart Lifecycle
    Day 0 : Cart created — stored in Redis primary + cache
    Hour 1 : Cache TTL expires → next read fetches from primary
    Day 1-30 : Every mutation refreshes expiresAt + Redis TTL
    Day 30 : Redis TTL expires → cart auto-deleted
```

---

## 5. Data Consistency

### Optimistic Locking

**Scenario**: Two concurrent requests add different items to the same user's cart.

| Step | Request A | Request B |
|------|-----------|-----------|
| 1 | WATCH `cart:data:user1` | WATCH `cart:data:user1` |
| 2 | GET → version=5, 2 items | GET → version=5, 2 items |
| 3 | Add item X → MULTI/SET version=6/EXEC | Add item Y → MULTI/SET version=6/EXEC |
| 4 | ✅ EXEC succeeds | ❌ EXEC returns null (WATCH triggered) |
| 5 | — | → `VersionConflictException` → 409 Conflict |

The client can retry Request B, which will read version=6 and succeed.

### Cache Consistency

With **write-through** strategy, cache is always warm after writes:

```
T1: Handler saves cart to Redis primary (WATCH/MULTI/EXEC)
T2: Handler writes cart to cache (SET cart:{userId})
T3: Next read → cache HIT (consistent with primary)
```

No stale-read window exists because the same handler updates both stores sequentially.
