# Section 9 — Concurrency & Locking

## Concurrency Control Strategies

| Strategy | Where Used | Implementation |
|----------|-----------|----------------|
| **Optimistic Locking (OCC)** | Inventory, Orders, Cart | `version` column — `UPDATE ... WHERE version = ?`, retry on conflict |
| **Distributed Locks** | Inventory (stock reservation) | Redis `SET NX PX` + Lua release script |
| **Database Transactions** | All PostgreSQL services | TypeORM `DataSource.transaction()` via `UnitOfWork` |
| **Idempotent Processing** | All Kafka consumers | `processed_events` table — check before execute |

### Optimistic Concurrency Control (OCC) in Inventory

The `ProductInventory` entity uses OCC via a `version` column:

1. Load entity with current version (e.g., `version = 5`)
2. Perform domain operation (e.g., `reserve(10)`)
3. Save with `WHERE version = 5`
4. If another transaction modified the row, the UPDATE affects 0 rows → TypeORM throws `OptimisticLockVersionMismatchError`
5. Caller retries with fresh data

This approach is preferred over pessimistic locking because it avoids holding database locks during business logic execution, enabling higher throughput under concurrent load.

### Cart Service Optimistic Locking

Cart uses Redis-based optimistic locking with a `version` counter:

1. Read cart from Redis → includes `version: N`
2. Client modifies cart (add/remove items)
3. Write back to Redis only if current version still equals `N`
4. If version changed (another concurrent request modified the cart), throw `VersionConflictException`

### Idempotent Event Processing

Every Kafka consumer that produces side effects uses the `processed_events` table:

```typescript
// 1. Extract event ID
const eventId = event.id || event.payload?.idempotencyKey;

// 2. Check if already processed
const alreadyProcessed = await processedRepo.findOneBy({ eventId });
if (alreadyProcessed) {
  logger.debug(`Event ${eventId} already processed, skipping`);
  return;
}

// 3. Execute business logic
await commandBus.execute(new SomeCommand(event.payload));

// 4. Mark as processed
const processed = new ProcessedEventOrmEntity();
processed.eventId = eventId;
await processedRepo.save(processed);
```

This guarantees exactly-once semantics on top of Kafka's at-least-once delivery.

---

# Section 10 — Indexing & Database Performance

## OpenSearch Index Strategy

The Search Service uses OpenSearch with optimized field mappings:

| Field | Type | Purpose |
|-------|------|---------|
| `id` | keyword | Exact match filtering |
| `name` | search_as_you_type (shingle=3) | Typeahead/autocomplete queries |
| `name_suggest` | completion | Dedicated suggestion queries |
| `description` | text (standard analyzer) | Full-text search |
| `price` | float | Range queries and sorting |
| `status` | keyword | Faceted filtering |
| `categoryId` | keyword | Category-based filtering |
| `attributes` | object | Dynamic attribute filtering |
| `indexedAt` | date | Freshness tracking |

### Query Patterns

- **Full-text search**: `multi_match` across `name` and `description` with boosted `name` weight
- **Autocomplete**: `search_as_you_type` with `multi_match` on `name`, `name._2gram`, `name._3gram`
- **Suggestions**: Completion suggester on `name_suggest` field
- **Faceted search**: `terms` aggregation on `categoryId`, `status`; `range` aggregation on `price`

## PostgreSQL Query Optimization

### N+1 Prevention

- Services use TypeORM `relations` option or `QueryBuilder.leftJoinAndSelect()` for eager loading
- Order items are loaded with orders in a single query: `findOne({ relations: ['items'] })`

### Transaction Boundaries

- All write operations use `UnitOfWork.execute()` which wraps in `DataSource.transaction()`
- Read queries use the default connection (no transaction overhead)
- The outbox write is ALWAYS in the same transaction as the business write

---

# Section 11 — Stream Processing

## Kafka Architecture

### Local Development
- **KRaft mode** (no ZooKeeper) — `apache/kafka:4.1.1` image
- Single broker on port 9092
- Combined broker + controller roles

### Production (AWS MSK)
- 3 × `kafka.m5.large` broker nodes
- 500 GB EBS per broker
- TLS-encrypted connections
- 30-day log retention

### Consumer Groups

| Consumer Group | Service | Subscribed Topics |
|---------------|---------|-------------------|
| `inventory-service` | Inventory Service | `order.events`, `cart.events` |
| `order-saga` | Order Service | `inventory.reserved`, `inventory.reservation_failed`, `payment.processed`, `payment.failed` |
| `search-indexer` | Search Service | `product.created`, `product.updated`, `product.deleted` |
| `notification-service` | Notification Service | `order.events`, `cart.events`, `user.events` |
| `payment-consumer` | Payment Service | `order.events` |

### Ordering Guarantees

- Events are keyed by entity ID (e.g., `orderId`, `productId`) ensuring all events for the same entity go to the same partition
- This guarantees ordering within an entity — critical for saga step sequencing
- Cross-entity ordering is NOT guaranteed (by design)

### Message Retention & Replay

- Production: 30-day retention (`log_retention_days = 30`)
- Consumer offset tracking: Kafka-managed (auto-commit after processing)
- Replay: Consumers subscribe with `fromBeginning: false` — only new events
- For full rebuild: Search Service has `RebuildIndexCommand` that replays from source DB

### Dead Letter Queue (DLQ)

Failed messages are routed to DLQ topics using `KafkaDlqProducer`:

```
Original topic: order.events
DLQ topic:      order.events.dlq

DLQ message headers:
- x-dlq-reason: error message
- x-dlq-timestamp: ISO-8601
- x-dlq-original-topic: original topic name
```

---

# Section 12 — Security Architecture

## Authentication Flow

```
1. Client → POST /auth/login (email + password)
2. Auth Service → bcrypt verify → Generate JWT access token + refresh token
3. Client stores tokens
4. Client → GET /orders (Authorization: Bearer <accessToken>)
5. API Gateway → JwtAuthGuard → passport-jwt validates signature + expiry
6. API Gateway → Signs HMAC internal headers
7. Downstream → InternalAuthGuard → Verifies HMAC
```

## JWT Token Architecture

| Token | TTL | Storage | Contents |
|-------|-----|---------|----------|
| **Access Token** | 15 min | Client-side (memory/localStorage) | `{ sub: userId, email, roles, jti, iat, exp }` |
| **Refresh Token** | 7 days | Redis (`refresh:{uid}:{tid}`) | UUID identifier only |

## Service-to-Service Security (HMAC)

The API Gateway signs internal headers before forwarding to downstream services:

```typescript
// Signing (API Gateway)
const timestamp = Date.now().toString();
const data = `${userId}:${timestamp}`;
const signature = createHmac('sha256', INTERNAL_AUTH_SECRET).update(data).digest('hex');

// Headers injected:
'x-user-id': userId
'x-user-roles': roles.join(',')
'x-internal-timestamp': timestamp
'x-internal-signature': signature
```

**Verification** (downstream via `InternalAuthGuard`):
1. Extract `x-user-id`, `x-internal-timestamp`, `x-internal-signature`
2. Recompute HMAC: `HMAC-SHA256(secret, userId:timestamp)`
3. `timingSafeEqual` comparison (constant-time, prevents timing attacks)
4. Timestamp freshness check: reject if `|now - timestamp| > 5 minutes` (replay protection)

## Secrets Management

- **Development**: `.env` files (gitignored)
- **Production**: AWS Secrets Manager (Terraform-managed)
- **RDS passwords**: `manage_master_user_password = true` — AWS manages rotation
- **Critical secrets**: `JWT_SECRET`, `INTERNAL_AUTH_SECRET`, `REDIS_AUTH_TOKEN`

---

# Section 13 — Observability

## Logging

- **Library**: `nestjs-pino` (Pino logger)
- **Format**: Structured JSON in production, `pino-pretty` in development
- **Message key**: `message` (CloudWatch/Datadog compatible)
- **Log level**: `debug` in dev, `info` in production
- **Correlation**: `x-correlation-id` propagated through Kafka headers

## Tracing

- **Library**: OpenTelemetry SDK (`@opentelemetry/sdk-node`)
- **Auto-instrumentation**: `@opentelemetry/auto-instrumentations-node` (HTTP, PostgreSQL, Redis)
- **Exporter**: OTLP HTTP to configurable endpoint (`OTEL_EXPORTER_OTLP_ENDPOINT`)
- **Service name**: Configured per service in `initTracing()`

## Metrics

- **Library**: `@willsoto/nestjs-prometheus`
- **Endpoint**: `GET /metrics` on each service
- **Default metrics**: Node.js runtime metrics (GC, event loop, memory)
- **Custom metrics**: Per-service metrics (e.g., `SearchMetricsService`, `NotificationMetricsService`)

## Health Checks

- **Library**: `@nestjs/terminus`
- **Endpoint**: `GET /health` on every service
- **Checks**: Database connectivity, Redis connectivity, Kafka connectivity, OpenSearch connectivity

## Alerting (Production)

- **SNS topics**: Alarm notifications to configurable email endpoints
- **ALB alarms**: 5xx rate > 5, 4xx rate > 50, latency > 1s
- **RDS monitoring**: Per-cluster CloudWatch metrics
- **Container Insights**: ECS cluster-level metrics enabled

---

# Section 14 — Dev Workflow

## How to Run Locally

### 1. Start Infrastructure

```bash
cd docker
docker-compose up -d
# Starts: PostgreSQL (5432), Redis (6379), Kafka (9092), OpenSearch (9200)
```

### 2. Install Dependencies

```bash
# From project root
pnpm install
```

### 3. Build Shared Libraries

```bash
# Build all packages first (core, events, shared-types)
pnpm build
```

### 4. Run Individual Services

```bash
# Each service in its own terminal
cd apps/api-gateway && pnpm start:dev    # Port 3000
cd apps/auth-service && pnpm start:dev   # Port 3001
cd apps/user-service && pnpm start:dev   # Port 3002
# ... etc
```

### Service Startup Order

1. **Infrastructure** → Docker Compose (PostgreSQL, Redis, Kafka, OpenSearch)
2. **Shared packages** → Build `@ecommerce/core`, `@ecommerce/events`, `@ecommerce/shared-types`
3. **Independent services** → Auth, User, Product (can start in any order)
4. **Dependent services** → Search (needs Kafka + OpenSearch), Cart (needs Redis), Inventory (needs Kafka + PostgreSQL)
5. **Orchestrators** → Order Service (needs Kafka for saga events)
6. **Downstream** → Payment, Notification (consume Kafka events)
7. **Entry point** → API Gateway (last, routes to all services)

### Environment Configuration

Each service has `.env.example` → copy to `.env`:

```bash
# Common variables
NODE_ENV=development
PORT=300X

# PostgreSQL (services with DB)
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=ecommerce

# Redis (services using Redis)
REDIS_HOST=localhost
REDIS_PORT=6379

# Kafka
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=<service-name>
KAFKA_CONSUMER_GROUP_ID=<service-name>

# Service-specific
JWT_SECRET=your-secret-key
INTERNAL_AUTH_SECRET=shared-internal-secret
```

### Debugging Tips

1. **Check service health**: `GET http://localhost:300X/health`
2. **View logs**: Services output structured JSON — use `pnpm start:dev` for pretty-printed logs
3. **Check Kafka topics**: Use `kafka-console-consumer` from the Kafka container
4. **Check Redis**: `redis-cli` → `KEYS *` to see all stored keys
5. **Check outbox**: Query `SELECT * FROM outbox_events WHERE processed = false` for stuck events
6. **Swagger docs**: API Gateway serves Swagger at `/api` (if configured)
