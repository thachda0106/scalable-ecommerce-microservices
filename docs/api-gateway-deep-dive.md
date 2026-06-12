# API Gateway — Deep Dive

---

## 1. OVERVIEW TABLE

| File | Path | Role |
|---|---|---|
| `main.ts` | `src/main.ts` | Bootstrap: validates env vars, initializes tracing, creates NestJS app with global middleware |
| `app.module.ts` | `src/app.module.ts` | Root module: wires all imports, controllers, guards, interceptors, and Redis provider |
| `gateway.config.ts` | `src/config/gateway.config.ts` | Registers all configuration from env vars under the `gateway` namespace |
| `gateway.controller.ts` | `src/controllers/gateway.controller.ts` | Main controller: 9 proxy routes + 3 BFF aggregation routes |
| `health.controller.ts` | `src/controllers/health.controller.ts` | Health probes: liveness check and Redis-ping readiness check |
| `request-id.middleware.ts` | `src/middleware/request-id.middleware.ts` | Injects or preserves `x-request-id` UUID header on every request |
| `aggregation.module.ts` | `src/modules/aggregation/aggregation.module.ts` | NestJS module: bundles all aggregation services and controllers |
| `cart-summary.service.ts` | `src/modules/aggregation/cart-summary.service.ts` | BFF: fetches cart items, then enriches each with product + inventory data |
| `dashboard.service.ts` | `src/modules/aggregation/dashboard.service.ts` | BFF: aggregates user profile, orders, and notifications with partial-success |
| `order-details.service.ts` | `src/modules/aggregation/order-details.service.ts` | BFF: fetches order, then attaches payment details |
| `product-page.service.ts` | `src/modules/aggregation/product-page.service.ts` | BFF: fetches product, inventory, and reviews in parallel |
| `user-dashboard.controller.ts` | `src/modules/aggregation/user-dashboard.controller.ts` | Controller: exposes `GET /user-dashboard` requiring JWT |
| `constants.ts` | `src/common/constants.ts` | Single DI token: `REDIS_CLIENT` |
| `http-client.module.ts` | `src/common/http-client.module.ts` | Registers `HttpModule` (Axios) with configurable timeout and `BaseHttpClient` |
| `http-client.ts` | `src/common/http-client.ts` | Core HTTP layer: forwardRequest, directGet, execute (with safeExecute resilience) |
| `types.ts` | `src/common/types.ts` | Extends Express `Request` with optional `user` payload from JWT guard |
| `public.decorator.ts` | `src/common/decorators/public.decorator.ts` | `@Public()` decorator: marks routes that skip JWT authentication |
| `all-exceptions.filter.ts` | `src/common/filters/all-exceptions.filter.ts` | Local catch-all exception filter (used in app module, not globally applied) |
| `jwt-auth.guard.ts` | `src/common/guards/jwt-auth.guard.ts` | APP_GUARD: validates JWT on every route unless `@Public()` is present |
| `jwt.strategy.ts` | `src/common/guards/jwt.strategy.ts` | Passport strategy: extracts Bearer token, verifies with `JWT_SECRET`, decodes payload |
| `logging.interceptor.ts` | `src/common/interceptors/logging.interceptor.ts` | Local logging interceptor (unused — package version used globally instead) |
| `timeout.interceptor.ts` | `src/common/interceptors/timeout.interceptor.ts` | APP_INTERCEPTOR: wraps every route with an RxJS `timeout()` operator |

### Package Dependencies (imported by gateway)

| File | Path | Role |
|---|---|---|
| `internal-auth.ts` | `packages/core/src/security/internal-auth.ts` | HMAC-SHA256 sign and verify for identity headers between services |
| `internal-auth.guard.ts` | `packages/core/src/security/internal-auth.guard.ts` | Guard used by downstream services to verify HMAC headers |
| `safe-execute.ts` | `packages/core/src/resilience/safe-execute.ts` | Composes timeout, retry, circuit breaker, strategy around any async function |
| `strategies.ts` | `packages/core/src/resilience/strategies.ts` | FAIL_OPEN, FAIL_CLOSE, NON_BLOCKING enum + applyStrategy() |
| `circuit-breaker.ts` | `packages/core/src/resilience/circuit-breaker.ts` | Per-key circuit breaker with CLOSED → OPEN → HALF_OPEN transitions |
| `retry.ts` | `packages/core/src/resilience/retry.ts` | Exponential backoff with 25% jitter |
| `timeout.ts` | `packages/core/src/resilience/timeout.ts` | Promise.race with a setTimeout reject |
| `tracing.ts` | `packages/core/src/observability/tracing.ts` | OpenTelemetry SDK init with OTLP exporter |
| `logging.ts` | `packages/core/src/observability/logging.ts` | Pino logger module factory |
| `metrics.ts` | `packages/core/src/observability/metrics.ts` | Prometheus module at `/metrics` |
| `global-exception.filter.ts` | `packages/core/src/filters/global-exception.filter.ts` | Standardized error response with correlation ID, OTel span recording |
| `http-logging.interceptor.ts` | `packages/core/src/interceptors/http-logging.interceptor.ts` | Logs method, URL, status, correlation ID, latency |
| `metrics.interceptor.ts` | `packages/core/src/interceptors/metrics.interceptor.ts` | Prometheus counters + histograms for HTTP requests |

---

## 2. DECLARATIVE KNOWLEDGE

### 2.1 The Problem

```
                           ┌─────────────────────────────┐
                           │       Web / Mobile App       │
                           └─────────────┬───────────────┘
                                         │  single origin
                                         ▼
                           ┌─────────────────────────────┐
                           │      API GATEWAY :3000       │
                           │                              │
                           │  Helmets, CORS, Rate Limit,  │
                           │  JWT Auth, Timeout, Logging, │
                           │  Metrics, Circuit Breaker    │
                           │                              │
                           │  ┌────────────────────────┐  │
                           │  │  Proxy: forward reqs    │  │
                           │  │  BFF: aggregate data    │  │
                           │  └────────────────────────┘  │
                           └──┬──┬──┬──┬──┬──┬──┬──┬──┘
                              │  │  │  │  │  │  │  │
          ┌───────────────────┘  │  │  │  │  │  │  └──────────────┐
          ▼                      ▼  ▼  ▼  ▼  ▼  ▼                 ▼
   ┌──────────┐          ┌────────────────────────────────┐  ┌──────────┐
   │  Auth    │          │  User  Product  Cart   Order   │  │Payment   │
   │ :3001    │          │  :3002 :3003    :3005  :3006   │  │:3008     │
   └──────────┘          └────────────────────────────────┘  └──────────┘
                               Search  Inventory   Notification
                               :3004   :3007        :3009
```

**The core issue**: 9 backend microservices must be reachable from a single origin. The gateway solves:
1. **Single entry point** — one URL, one port, one CORS config
2. **Cross-cutting concerns** — auth, rate limiting, logging, metrics applied once
3. **BFF aggregation** — compose data from multiple services into page-shaped responses
4. **Resilience** — circuit breakers, timeouts, retries at the edge before traffic reaches services

### 2.2 Core Variables Table

| Variable Name | Type | Plain-English Meaning |
|---|---|---|
| `PORT` | `number` (default 3000) | The TCP port the gateway listens on |
| `JWT_SECRET` | `string` (required, no fallback) | Shared secret for verifying incoming JWT bearer tokens |
| `INTERNAL_AUTH_SECRET` | `string` (required, no fallback) | Shared secret for HMAC-signing user identity before forwarding to downstream services |
| `CORS_ORIGIN` | `string` (default `*`, required in production) | Which web origins are allowed to call the API |
| `REQUEST_TIMEOUT` | `number` (default 5000) | Maximum milliseconds the gateway waits for a handler response |
| `gateway.services.auth` | `string` (default `http://localhost:3001`) | Base URL of the Auth microservice |
| `gateway.services.user` | `string` (default `http://localhost:3002`) | Base URL of the User microservice |
| `gateway.services.product` | `string` (default `http://localhost:3003`) | Base URL of the Product microservice |
| `gateway.services.search` | `string` (default `http://localhost:3004`) | Base URL of the Search microservice |
| `gateway.services.cart` | `string` (default `http://localhost:3005`) | Base URL of the Cart microservice |
| `gateway.services.order` | `string` (default `http://localhost:3006`) | Base URL of the Order microservice |
| `gateway.services.inventory` | `string` (default `http://localhost:3007`) | Base URL of the Inventory microservice |
| `gateway.services.payment` | `string` (default `http://localhost:3008`) | Base URL of the Payment microservice |
| `gateway.services.notification` | `string` (default `http://localhost:3009`) | Base URL of the Notification microservice |
| `gateway.redis.host` | `string` (default `localhost`) | Redis host for rate-limiting storage |
| `gateway.redis.port` | `number` (default 6379) | Redis port for rate-limiting storage |
| `gateway.timeout` | `number` (default 5000) | Axios HTTP timeout for downstream calls |
| `gateway.corsOrigin` | `string` (default `*`) | CORS allowed origin |
| `gateway.jwt.secret` | `string` | Same as `JWT_SECRET`, accessed via config service |
| `IS_PUBLIC_KEY` | `'isPublic'` (literal) | Reflector metadata key; routes with this skip JWT validation |
| `REDIS_CLIENT` | `'REDIS_CLIENT'` (DI token literal) | NestJS provider token for the ioredis Redis instance |
| `req.user` | `{ userId, email, roles } \| undefined` | Decoded JWT payload attached by JwtAuthGuard to every authenticated request |
| `x-request-id` | `string` (UUID v4) | Request tracing ID; generated by middleware if missing, propagated to all downstream calls |
| `x-correlation-id` | `string` (UUID v4) | Alternate tracing ID; falls back to `x-request-id` if absent |
| `x-user-id` | `string` | Authenticated user ID forwarded to downstream services |
| `x-user-roles` | `string` (comma-separated) | Authenticated user roles forwarded to downstream services |
| `x-internal-timestamp` | `string` (epoch ms) | Timestamp used for HMAC replay protection (5-minute window) |
| `x-internal-signature` | `string` (hex) | HMAC-SHA256 signature of `userId:timestamp` with `INTERNAL_AUTH_SECRET` |
| `safeExecute options.strategy` | `FAIL_CLOSE` | Default failure strategy: throw error to caller |
| `safeExecute options.timeoutMs` | `4000` | Per-downstream-call timeout (less than global 5000ms) |
| `safeExecute options.retry.maxAttempts` | `0` | No retries at gateway level (downstream services handle retries) |
| `safeExecute options.circuitBreaker.failureThreshold` | `5` | Open the circuit after 5 consecutive failures |
| `safeExecute options.circuitBreaker.resetTimeoutMs` | `10000` | Wait 10 seconds before transitioning OPEN → HALF_OPEN |

### 2.3 Key Concepts Table

| Term | Definition |
|---|---|
| **Proxy Forwarding** | Receiving an HTTP request and relaying it unchanged to a downstream service, then returning the downstream response to the client |
| **BFF Aggregation** | Backend-for-Frontend pattern: composing data from multiple microservices into a single response tailored for a specific UI page |
| **HMAC Identity Signing** | The gateway signs user identity headers with a shared secret so downstream services can verify the caller's identity without trusting plaintext headers |
| **JWT Guard Bypass** | The `@Public()` decorator sets reflector metadata; JwtAuthGuard checks this metadata and skips JWT validation for marked routes |
| **Circuit Breaker** | A failure counter per key; after 5 consecutive failures, all calls are rejected immediately for 10 seconds, then one probe call is allowed |
| **Rate Limiting** | ThrottlerModule with Redis backend limits each client to 100 requests per 60-second window |
| **Correlation ID** | A UUID that travels from client → gateway → all downstream services, enabling distributed tracing across log streams |
| **Graceful Degradation** | When an enrichment call fails during BFF aggregation, that field becomes `null` instead of failing the entire response |
| **Partial Success** | `Promise.allSettled` in the dashboard allows profile, orders, and notifications to succeed or fail independently |

---

## 3. DATA STRUCTURES

### 3.1 GatewayRequest (extends Express Request)

```typescript
// src/common/types.ts:3-8
interface GatewayRequest extends Request {
  user?: {
    userId: string;    // decoded from JWT payload.sub
    email: string;     // decoded from JWT payload.email
    roles: string[];   // decoded from JWT payload.roles
  };
}
```

### 3.2 JWT Payload and Authenticated User

```typescript
// src/common/guards/jwt.strategy.ts:6-16
interface JwtPayload {
  sub: string;         // user unique identifier from JWT subject claim
  email: string;       // user email from JWT claims
  roles: string[];     // RBAC roles from JWT claims
}

interface AuthenticatedUser {
  userId: string;      // mapped from payload.sub
  email: string;       // copied from payload.email
  roles: string[];     // copied from payload.roles
}
```

### 3.3 Gateway Configuration Shape

```typescript
// src/config/gateway.config.ts:3-26 — inferred type from registerAs('gateway', ...)
type GatewayConfigShape = {
  port: number;                          // parsed from PORT env, default 3000
  corsOrigin: string;                    // parsed from CORS_ORIGIN, default '*'
  timeout: number;                       // parsed from REQUEST_TIMEOUT, default 5000
  redis: {
    host: string;                        // parsed from REDIS_HOST, default 'localhost'
    port: number;                        // parsed from REDIS_PORT, default 6379
  };
  services: {
    auth: string;                        // default 'http://localhost:3001'
    user: string;                        // default 'http://localhost:3002'
    product: string;                     // default 'http://localhost:3003'
    search: string;                      // default 'http://localhost:3004'
    cart: string;                        // default 'http://localhost:3005'
    order: string;                       // default 'http://localhost:3006'
    inventory: string;                   // default 'http://localhost:3007'
    payment: string;                     // default 'http://localhost:3008'
    notification: string;                // default 'http://localhost:3009'
  };
  jwt: {
    secret: string;                      // from JWT_SECRET, no fallback
  };
};
```

### 3.4 Cart Data (BFF enrichment input)

```typescript
// src/modules/aggregation/cart-summary.service.ts:6-9
interface CartData {
  items?: Array<{ productId: string }>;  // cart line items with product references
  [key: string]: unknown;                // other cart fields preserved as-is
}
```

### 3.5 SafeExecute Options (from @ecommerce/core)

```typescript
// packages/core/src/resilience/safe-execute.ts:11-26
interface SafeExecuteOptions<T> {
  strategy?: StrategyType;                // FAIL_CLOSE, FAIL_OPEN, or NON_BLOCKING
  retry?: {
    attempts: number;                     // total attempts including first (default 1)
    backoffMs?: number;                   // base delay before retry, doubles each attempt
  };
  timeout?: number;                       // per-call timeout in ms, 0 = no timeout
  circuitBreakerKey?: string;             // unique key for shared circuit state
  circuitBreakerOptions?: {
    failureThreshold?: number;            // consecutive failures to open circuit (default 5)
    resetTimeoutMs?: number;             // ms before OPEN → HALF_OPEN (default 10000)
  };
  fallback?: () => T | Promise<T>;       // required for FAIL_OPEN strategy
  label?: string;                         // logging/tracing identifier
}
```

### 3.6 Standard Error Response (from @ecommerce/core)

```typescript
// packages/core/src/filters/global-exception.filter.ts:13-20
interface StandardErrorResponse {
  success: false;                         // always false for error responses
  code: string;                           // machine-readable error code (e.g. "NOT_FOUND")
  message: string;                        // human-readable error description
  details?: any;                          // optional validation error details array
  correlationId: string;                  // traceability ID for log correlation
  timestamp: string;                      // ISO 8601 timestamp of error
}
```

### 3.7 Circuit Breaker State Machine

```typescript
// packages/core/src/resilience/circuit-breaker.ts:1-5,7-12,14-19
enum CircuitState {
  CLOSED = 'CLOSED',       // normal operation, failures counted
  OPEN = 'OPEN',           // all calls rejected immediately
  HALF_OPEN = 'HALF_OPEN'  // one probe call allowed
}

interface CircuitBreakerOptions {
  failureThreshold?: number;   // default 5
  resetTimeoutMs?: number;     // default 10000
}

interface CircuitData {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime?: number;
}
```

---

## 4. ALGORITHM DIAGRAMS

### 4.1 Request Processing Pipeline

```
  Client Request
       │
       ▼
  ┌──────────┐
  │  Helmet   │  Sets security headers (CSP, X-Frame-Options, etc.)
  └────┬─────┘
       ▼
  ┌──────────┐
  │express.json│  Parses JSON body with 1 MB limit  [main.ts:38]
  └────┬─────┘
       ▼
  ┌──────────────┐
  │RequestIdMid.  │  Injects x-request-id UUID if missing  [middleware/request-id.middleware.ts:8]
  └────┬─────────┘
       ▼
  ┌──────────────┐
  │ThrottlerGuard │  Redis-backed: 100 req / 60s window  [app.module.ts:33]
  └────┬─────────┘
       ▼
  ┌──────────────┐
  │ JwtAuthGuard  │  If @Public() → skip. Else validate Bearer token  [jwt-auth.guard.ts:22-28]
  └────┬─────────┘
       ▼
  ┌─────────────────┐
  │TimeoutInterceptor│  RxJS timeout(5000ms) wraps the handler  [timeout.interceptor.ts:16]
  └────┬────────────┘
       ▼
  ┌──────────────┐
  │  Controller    │  GatewayController or HealthController or UserDashboardController
  └────┬─────────┘
       ▼
  ┌──────────────┐
  │BaseHttpClient  │  forwardRequest or directGet → execute → safeExecute
  └────┬─────────┘
       ▼
  Downstream Microservice (Auth, User, Product, Cart, Order, etc.)
```

### 4.2 Proxy Forwarding Algorithm

**Formula**: `targetUrl = baseUrl + req.url`

```
Input:  baseUrl = "http://localhost:3005"
        req.url  = "/cart/items?page=1&limit=10"
        req.method = "GET"
        req.body = undefined (GET has no body)
        req.query = { page: "1", limit: "10" }

        req.user = { userId: "usr-42", email: "bob@example.com", roles: ["customer"] }
        INTERNAL_AUTH_SECRET = "shared-secret-here"

Computation:
  1. targetUrl = "http://localhost:3005" + "/cart/items?page=1&limit=10"
               = "http://localhost:3005/cart/items?page=1&limit=10"

  2. Header propagation:
     - x-request-id: "a1b2c3d4-..."          ← from incoming request
     - x-correlation-id: "a1b2c3d4-..."       ← same as x-request-id
     - authorization: "Bearer eyJ..."         ← from incoming request

  3. HMAC identity signing:  [http-client.ts:72-85]
     timestamp = "1718123456789"  (Date.now())
     data = "usr-42:1718123456789"
     signature = HMAC-SHA256("shared-secret-here", "usr-42:1718123456789")
               = "a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0"

     Headers added:
     - x-user-id: "usr-42"
     - x-user-roles: "customer"
     - x-internal-timestamp: "1718123456789"
     - x-internal-signature: "a3f8b2c1..."  (64 hex chars)

  4. Axios config:
     {
       method: "GET",
       url: "http://localhost:3005/cart/items?page=1&limit=10",
       headers: { x-request-id, x-correlation-id, authorization, x-user-id, ... },
       data: undefined,
       params: { page: "1", limit: "10" }
     }

  5. resilience: safeExecute(fn, {
       strategy: FAIL_CLOSE,
       timeoutMs: 4000,
       retry: { maxAttempts: 0 },
       circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 10000 }
     })

Output: response.data from Cart Service (e.g. { items: [...], total: 149.97 })
```

**Downstream service verifies headers** (using `InternalAuthGuard`):
```
Input:  headers from forwarded request
        INTERNAL_AUTH_SECRET = "shared-secret-here"

Verification:
  1. Extract x-user-id="usr-42", x-internal-timestamp="1718123456789",
            x-internal-signature="a3f8b2c1..."
  2. Check timestamp freshness: |Date.now() - 1718123456789| < 300000ms (5 min)
  3. Compute expected: HMAC-SHA256("shared-secret-here", "usr-42:1718123456789")
  4. timingSafeEqual(expected, received) → true

Output: Request accepted, downstream service trusts x-user-id and x-user-roles
```

### 4.3 BFF Aggregation Algorithms

#### 4.3.1 Product Page Aggregation

```
Input:  productId = "prod-789"
        productUrl = "http://localhost:3003"
        inventoryUrl = "http://localhost:3007"
        headers = { x-request-id: "a1b2c3d4-..." }

Computation:
  productP = directGet("http://localhost:3003/products/prod-789", headers)
  inventoryP = directGet("http://localhost:3007/inventory/prod-789", headers)
  reviewsP = directGet("http://localhost:3003/reviews/product/prod-789", headers)
             .catch(() => [])   ← reviews are optional; failure → empty array

  Promise.all([productP, inventoryP, reviewsP])

  ┌──────────┐   ┌──────────────┐   ┌──────────┐
  │ product  │   │  inventory   │   │ reviews  │
  │ GET :3003│   │  GET :3007   │   │ GET :3003│
  └────┬─────┘   └──────┬───────┘   └────┬─────┘
       │                │                 │
       ▼                ▼                 ▼
  { id, name,      { productId,       [{ rating: 4,
    price,           stock: 42,          comment: "..." },
    description }    reserved: 3 }      { rating: 5, ... }]
       │                │                 │
       └────────────────┼─────────────────┘
                        ▼
Output: {
  product:    { id: "prod-789", name: "Wireless Headphones", price: 79.99, ... },
  inventory:  { productId: "prod-789", stock: 42, reserved: 3 },
  reviews:    [{ rating: 4, comment: "Great sound" }, { rating: 5, ... }]
}
```

**Guard logic** (`product-page.service.ts:21-25`): If `productUrl` or `inventoryUrl` is falsy, throw 503 with "Aggregation dependencies not fully configured".

#### 4.3.2 Cart Summary Aggregation

```
Input:  req (with JWT-decoded user)

Step 1 — Fetch cart (sequential):
  forwardRequest("http://localhost:3005/cart", req)
  → { items: [{ productId: "p1" }, { productId: "p2" }], total: 0 }

Step 2 — Guard: items.length === 0 → return { cart, enrichments: [] }  [cart-summary.service.ts:52-54]

Step 3 — Concurrent enrichment per item:
  For each item in cartData.items:
    productP  = directGet("http://localhost:3003/products/{item.productId}")
    inventoryP = directGet("http://localhost:3007/inventory/{item.productId}")
    Promise.all([productP, inventoryP]) per item
    try/catch per item → if fails: { item, product: null, inventory: null, error: "Enrichment failed" }

  ┌──────────────────────────────────────────────┐
  │  Item p1:                                     │
  │  ┌──────────┐         ┌──────────────┐       │
  │  │ GET :3003│         │  GET :3007   │       │
  │  │/products/p1        │/inventory/p1 │       │
  │  └────┬─────┘         └──────┬───────┘       │
  │       └──────────┬───────────┘                │
  │                  ▼                            │
  │  { item: {productId:"p1"}, product: {...},    │
  │    inventory: {...} }                         │
  └──────────────────────────────────────────────┘
  ┌──────────────────────────────────────────────┐
  │  Item p2:                                     │
  │  ┌──────────┐         ┌──────────────┐       │
  │  │ GET :3003│         │  GET :3007   │       │
  │  │/products/p2        │/inventory/p2 │       │
  │  └────┬─────┘         └──────┬───────┘       │
  │       └──────────┬───────────┘                │
  │                  ▼                            │
  │  { item: {productId:"p2"}, product: {...},    │
  │    inventory: {...} }                         │
  └──────────────────────────────────────────────┘

Step 4 — Promise.all all item promises

Output: {
  cart: { items: [...], total: 0 },
  enrichments: [
    { item: {productId:"p1"}, product: {name:"Headphones",...}, inventory: {stock:42,...} },
    { item: {productId:"p2"}, product: {name:"Charger",...},    inventory: {stock:150,...} }
  ]
}
```

#### 4.3.3 Order Details Aggregation

```
Input:  orderId = "order-456"
        req (with JWT-decoded user)

Step 1 — Fetch order (sequential, blocks enrichment if missing):
  forwardRequest("http://localhost:3006/orders/order-456", req)
  → { id: "order-456", status: "shipped", items: [...], total: 199.99 }

  Guard: if orderData is falsy → throw 404 "Order Payload Empty"  [order-details.service.ts:39-41]

Step 2 — Fetch payment (can fail gracefully):
  directGet("http://localhost:3008/payments/order/order-456", headers)
  try/catch → if fails: { status: "payment tracking unavailable" }

Output: {
  order:   { id: "order-456", status: "shipped", total: 199.99, ... },
  payment: { id: "pay-789", status: "captured", amount: 199.99, ... }
}
```

#### 4.3.4 Dashboard Aggregation

```
Input:  userId = "usr-42"

Computation: Promise.allSettled of 3 calls:

  ┌────────────────────────────────────────────────────────┐
  │  GET :3002/users/usr-42          → { id:"usr-42",      │
  │                                     name:"Bob", ... }  │
  ├────────────────────────────────────────────────────────┤
  │  GET :3006/orders?userId=usr-42  → [{ id:"order-1",    │
  │                                      status:"shipped"}] │
  ├────────────────────────────────────────────────────────┤
  │  GET :3009/notifications?userId=usr-42                  │
  │                                   → [{ type:"promo",   │
  │                                       read:false }]    │
  └────────────────────────────────────────────────────────┘

Each result checked: status === 'fulfilled' ? value : null

Output: {
  user:          { id: "usr-42", name: "Bob", email: "bob@example.com" },
  recentOrders:  [{ id: "order-1", status: "shipped", total: 199.99 }],
  notifications: [{ type: "promo", message: "20% off!", read: false }],
  errors: {
    user:          null,  ← no error
    orders:        null,  ← no error
    notifications: null   ← no error
  }
}

If User Service fails:
Output: {
  user: null,
  recentOrders: [...],
  notifications: [...],
  errors: {
    user: "connect ECONNREFUSED 127.0.0.1:3002",
    orders: null,
    notifications: null
  }
}
```

### 4.4 Resilience Pipeline

```
Composition order (built in safeExecute, innermost → outermost):
  Circuit Breaker → Retry → Timeout → fn()

Concrete example: POST to Payment Service

  fn = () => firstValueFrom(httpService.request({
    method: 'POST',
    url: 'http://localhost:3008/payments/charge',
    data: { amount: 199.99, currency: 'USD' }
  }))

  ┌─────────────────────────────────────────────────────────┐
  │ Step 1: Circuit Breaker (outermost)                      │
  │   key = "Gateway HTTP: POST http://localhost:3008/..."   │
  │   State check:                                            │
  │     OPEN? → "CircuitBreaker is OPEN" → skip to catch      │
  │     CLOSED/HALF_OPEN → proceed to step 2                  │
  ├─────────────────────────────────────────────────────────┤
  │ Step 2: Retry                                            │
  │   maxAttempts = 0 → skipped (no retries)                  │
  ├─────────────────────────────────────────────────────────┤
  │ Step 3: Timeout                                          │
  │   timeoutMs = 4000                                        │
  │   Promise.race([fn(), timeoutPromise(4000)])             │
  │   → fn() completes in 320ms → clearTimeout, return data   │
  │   → if fn() > 4000ms → reject "timed out after 4000ms"   │
  ├─────────────────────────────────────────────────────────┤
  │ Step 4: fn() executes                                     │
  │   Axios POST to Payment Service                          │
  │   Payment processes, returns 201 { id: "pay-789" }       │
  └─────────────────────────────────────────────────────────┘

Success path:
  Duration = 320ms
  Metrics: resilience_exec_total{strategy="FAIL_CLOSE", status="success"} += 1
  Metrics: resilience_exec_duration_seconds{strategy="FAIL_CLOSE"} += 0.32
  Log: [Gateway HTTP: POST http://localhost:3008/...] OK in 320ms (retries: 0)
  OTel: span.setStatus({ code: OK })

Failure path (Payment Service down, 5th failure):
  Circuit state was CLOSED, failures hit 5 → OPEN
  Circuit Breaker throws: "CircuitBreaker '...' is OPEN — rejecting call"
  execute() catches, checks message for "Circuit breaker is OPEN" → true
  Throws HttpException("Service Temporarily Unavailable (Fast Fallback)", 503)
  Client receives: { statusCode: 503, message: "Service Temporarily Unavailable" }
```

**Circuit Breaker State Transitions**:

```
     ┌──────────┐
     │  CLOSED   │── failures ≥ 5 ──→ ┌──────────┐
     │ (normal)  │                    │   OPEN    │
     │failures:0 │←── success ─────── │ (reject)  │
     └──────────┘                    └─────┬─────┘
                                          │ elapsed > 10000ms
                                          ▼
                                     ┌──────────┐
                                     │HALF_OPEN │
                                     │(1 probe) │
                                     └────┬─────┘
                                    success│    │failure
                                           │    │
                                     ┌─────┘    └─────┐
                                     ▼                ▼
                                ┌──────────┐    ┌──────────┐
                                │  CLOSED   │    │   OPEN    │
                                └──────────┘    └──────────┘
```

**Mode Comparison: Proxy vs BFF Aggregation vs Dashboard**

```
                     PROXY MODE             BFF AGGREGATION         DASHBOARD
                     ──────────             ───────────────         ─────────
Route example        All /auth/*path        /product-page/:id       /user-dashboard
JWT required?        No (@Public)           Yes (except product)    Yes
Concurrency          Single request         Promise.all (3)         Promise.allSettled (3)
Failure handling     Forwarded as-is        Whole request fails     Partial success
Response shape       Passthrough            { product, inv, rev }   { user, orders, notifications, errors }
Header propagation   Full (identity+auth)   Selective (id+auth)     Minimal (x-user-id only)
Service discovery    Dynamic (baseUrl+url)  Hardcoded service paths Hardcoded service paths
Type                 1-to-1 proxy           Data composition        Data composition
```

---

## 5. EVENT LIFECYCLE — Full Operation Traces

### 5.1 Trace: POST /auth/login (Proxy Mode, Unauthenticated)

```
Time  Layer              Action                                                    Value
────  ─────              ──────                                                    ─────
T+0   Client             POST http://localhost:3000/auth/login                     { email, password }

T+1   Helmet             Add security headers                                      CSP, X-Frame-Options, etc.
T+2   express.json       Parse 1 MB body                                           body = { email:"bob@ex.com", password:"s3cret" }

T+3   RequestIdMw        Check x-request-id header                                 undefined (missing)
                         Generate UUID v4                                          "550e8400-e29b-41d4-a716-446655440000"
                         Set req.headers['x-request-id']                           "550e8400-..."
                         Set res header x-request-id                               "550e8400-..."

T+4   ThrottlerGuard     Check Redis: rate limit key                               "550e8400-..." or IP
                         Tokens remaining                                          99 / 100 (1 used)
                         Allow                                                     true

T+5   JwtAuthGuard       Check reflector metadata for IS_PUBLIC_KEY                true (@Public() on routeAuth)
                         Bypass JWT validation                                     returns true

T+6   TimeoutInterceptor timeout(5000) wraps handler                               timer starts

T+7   GatewayController  routeAuth() called                                        req.params.path = "login"
                         configService.get('gateway.services.auth')                "http://localhost:3001"
                         forward("http://localhost:3001", req, "auth")             called

T+8   forward()          baseUrl check                                             "http://localhost:3001" (truthy)
                         targetUrl = baseUrl + req.url                             "http://localhost:3001/auth/login"

T+9   forwardRequest()   Headers built:
                         x-request-id                                              "550e8400-..."
                         x-correlation-id                                          "550e8400-..." (same)
                         authorization                                             undefined (no JWT yet)
                         req.user                                                  undefined (no JWT)
                         → skip identity signing                                   (dev fallback not reached)
                         Axios config:                                             { method:"POST", url:"http://...3001/auth/login",
                                                                                     data:{email,password}, params:{} }

T+10  execute()          safeExecute(fn, { strategy: FAIL_CLOSE, timeoutMs: 4000,
                                            retry: {maxAttempts:0},
                                            circuitBreaker: {failureThreshold:5, resetTimeoutMs:10000} })
                         Circuit breaker: key undefined → skipped
                         Retry: maxAttempts=0 → skipped
                         Timeout: Promise.race([axios.post, timeout(4000)])

T+11  Auth Service       Receives POST /auth/login                                  { email:"bob@ex.com", password:"s3cret" }
                         Validates credentials                                      valid
                         Generates JWT                                             "eyJhbGciOiJIUzI1NiIs..."
                         Responds 201                                               { access_token:"eyJ...", user:{id:"usr-42", email:"bob@ex.com", roles:["customer"]} }

T+12  execute()          axios.post resolves in 245ms                              response.status=201, response.data={...}
                         safeExecute success path:
                           execCounter.inc({status:"success"})                     +1
                           execDuration.observe(0.245)                             recorded
                           logger.debug("OK in 245ms (retries: 0)")               logged
                           span.setStatus({code:OK})                                OTel span

T+13  forwardRequest()   returns response.data                                     { access_token:"eyJ...", user:{...} }

T+14  forward()          returns to routeAuth()                                     { access_token:"eyJ...", user:{...} }

T+15  routeAuth()        returns to NestJS response pipeline

T+16  LoggingInterceptor tap: logger.log("[550e8400-...] POST /auth/login 201 - curl/8.x [48ms]")

T+17  MetricsInterceptor tap: requestCounter.inc({method:"POST", path:"/auth/{path}", status:"201"})
                              durationHistogram 0.048s recorded

T+18  Client receives    201                                                     { access_token:"eyJ...", user:{id:"usr-42", email:"bob@ex.com", roles:["customer"]} }
```

### 5.2 Trace: GET /cart-summary (BFF Aggregation, Authenticated)

```
Time  Layer              Action                                                    Value
────  ─────              ──────                                                    ─────
T+0   Client             GET /cart-summary                                         Authorization: Bearer eyJ...

T+5   JwtAuthGuard       IS_PUBLIC_KEY?                                            false
                         Passport validates JWT with JWT_SECRET
                         JwtStrategy.validate(payload)                             { userId:"usr-42", email:"bob@ex.com", roles:["customer"] }
                         req.user attached                                         req.user = { userId:"usr-42", ... }

T+8   GatewayController  getCartSummary(req)

T+9   CartSummarySvc     cartUrl = config.get('gateway.services.cart')             "http://localhost:3005"
                         productUrl = config.get('gateway.services.product')       "http://localhost:3003"
                         inventoryUrl = config.get('gateway.services.inventory')   "http://localhost:3007"
                         Guard: all 3 URLs truthy                                  pass

                         Headers built:
                           x-request-id: "550e8400-..."  (from req)
                           authorization: "Bearer eyJ..."  (from req)
                           x-user-id: "usr-42"  (from req.user)

T+10  forwardRequest()   GET http://localhost:3005/cart                             → { items:[{productId:"p9"},{productId:"p11"}], total:0 }

T+11  Guard              items.length > 0?                                         2 → proceed to enrichment

T+12  For item p9:       productP  = directGet("http://localhost:3003/products/p9")
                         inventoryP = directGet("http://localhost:3007/inventory/p9")
                         Promise.all([productP, inventoryP])
                         → { item:{productId:"p9"}, product:{name:"Keyboard",price:89.99}, inventory:{stock:30} }

T+12  For item p11:      productP  = directGet("http://localhost:3003/products/p11")
                         inventoryP = directGet("http://localhost:3007/inventory/p11")
                         → { item:{productId:"p11"}, product:{name:"Mouse",price:49.99}, inventory:{stock:0} }

T+13  Promise.all         Waits for both item enrichments (concurrent, not sequential)

T+15  Return              { cart:{items:[...], total:0},
                            enrichments:[
                              {item:{productId:"p9"}, product:{name:"Keyboard",price:89.99}, inventory:{stock:30}},
                              {item:{productId:"p11"}, product:{name:"Mouse",price:49.99}, inventory:{stock:0}}
                            ]}

T+16  LoggingInterceptor  [550e8400-...] GET /cart-summary 200 — PostmanRuntime/7.x [320ms]

T+17  Client receives     200 { cart:{...}, enrichments:[...] }
```

### 5.3 Trace: Downstream Failure — Inventory Service Down

```
Scenario: GET /product-page/prod-789 but Inventory Service :3007 is unreachable

T+0   Client             GET /product-page/prod-789

T+8   ProductPageSvc     productP = directGet("http://localhost:3003/products/prod-789")
                         inventoryP = directGet("http://localhost:3007/inventory/prod-789")
                         reviewsP = directGet("http://localhost:3003/reviews/product/prod-789").catch(() => [])

T+9   productP resolves   { id:"prod-789", name:"Wireless Headphones", price:79.99 }  (320ms)
T+9   reviewsP resolves   [{ rating:4, comment:"Great" }, { rating:5 }]                (280ms)

T+10  inventoryP          HTTP GET http://localhost:3007/inventory/prod-789
                         safeExecute {
                           timeout(4000) → Promise.race starts
                           4000ms elapses → "Operation timed out after 4000ms"
                           strategy: FAIL_CLOSE → throw error
                         }
                         execute() catches: not AxiosError with response
                         throws HttpException("Internal Gateway Error", 500)

T+10  Promise.all         inventoryP rejects → entire Promise.all rejects

T+12  Catch block         throw new HttpException("Product Aggregation Failed", 500)

T+13  GlobalExFilter      Catches HttpException(500)
                         correlationId = "550e8400-..."
                         StandardErrorResponse {
                           success: false,
                           code: "HTTP_500",
                           message: "Product Aggregation Failed",
                           correlationId: "550e8400-...",
                           timestamp: "2026-06-12T10:30:00.000Z"
                         }
                         logger.error("[550e8400-...] GET /product-page/prod-789 — 500 HTTP_500: Product Aggregation Failed")
                         OTel span: recordException + setAttribute(error.correlation_id)

T+14  Client receives     500 { success:false, code:"HTTP_500", message:"Product Aggregation Failed", ... }
```

---

## 6. FULL-STACK FLOW — Swimlane Diagram

```
Client (Browser/App)           API Gateway (:3000)                Downstream Services
═══════════════════           ═══════════════════                ═══════════════════
     │                              │                                   │
     │  1. POST /auth/login         │                                   │
     │  {email, password} ─────────>│                                   │
     │                              │  2. forwardRequest()              │
     │                              │     POST :3001/auth/login ───────>│ Auth :3001
     │                              │                                   │ 3. Validate creds
     │                              │  4. {access_token, user} <────────│  Generate JWT
     │  5. {access_token, user} <───│                                   │
     │                              │                                   │
     │  6. GET /cart-summary        │                                   │
     │  Bearer eyJ... ─────────────>│                                   │
     │                              │  7. JWT guard validates token     │
     │                              │     req.user = {userId, roles}    │
     │                              │                                   │
     │                              │  8. GET :3005/cart ──────────────>│ Cart :3005
     │                              │  9. {items:[p9,p11]} <───────────│
     │                              │                                   │
     │                              │  10. Concurrent enrichment:       │
     │                              │      GET :3003/products/p9 ──────>│ Product :3003
     │                              │      GET :3007/inventory/p9 ─────>│ Inventory :3007
     │                              │      GET :3003/products/p11 ─────>│ Product :3003
     │                              │      GET :3007/inventory/p11 ────>│ Inventory :3007
     │                              │                                   │
     │                              │  11. {product:p9, inv:p9} <──────│
     │                              │      {product:p11, inv:p11} <────│
     │                              │                                   │
     │  12. {cart, enrichments} <───│                                   │
     │                              │                                   │
     │  13. POST /orders            │                                   │
     │  Bearer eyJ... ─────────────>│                                   │
     │                              │  14. Sign identity headers        │
     │                              │      HMAC(userId:timestamp)       │
     │                              │                                   │
     │                              │  15. POST :3006/orders ──────────>│ Order :3006
     │                              │      x-user-id, x-internal-sig    │
     │                              │                                   │ 16. verifyInternalHeaders()
     │                              │                                   │     ✓ HMAC valid
     │                              │                                   │     Create order
     │                              │  17. {id:"order-789"} <──────────│
     │  18. {id:"order-789"} <──────│                                   │
     │                              │                                   │
═══════════════════           ═══════════════════                ═══════════════════

Legend:
  ─────────>  HTTP request
  <─────────  HTTP response
  ─ ─ ─ ─ > Internal (in-process)
```

---

## 7. DESIGN DECISIONS

### 7.1 Why `@All()` instead of individual `@Get()`, `@Post()`, etc. decorators?

The gateway is a transparent proxy. It does not know (or care) what HTTP methods downstream services expose. Using `@All('auth/*path')` means one route handler catches GET, POST, PUT, PATCH, DELETE, and OPTIONS for the entire `auth/*` prefix, then forwards the original method verbatim.

**What breaks without it**: Every new downstream endpoint would require a new route decorator in the gateway. A new `DELETE /auth/sessions` endpoint would get a 404 until the gateway controller is updated.

Decision location: `src/controllers/gateway.controller.ts:93` (`@All('auth/*path')`) and similar for all 9 services.

### 7.2 Why `targetUrl = baseUrl + req.url` instead of route rewriting?

The gateway preserves the full original URL path. `/auth/login` on the gateway becomes `/auth/login` on the Auth service. No path transformation logic is needed.

**What breaks without it**: If the gateway stripped the prefix (e.g., `/auth/login` → `/login`), every downstream service would need different route registrations depending on whether it's called directly or through the gateway. Path preservation means downstream services are unaware of the gateway.

Decision location: `src/controllers/gateway.controller.ts:256`.

### 7.3 Why HMAC signing instead of a shared internal JWT for service-to-service auth?

HMAC signing provides replay protection via the 5-minute timestamp tolerance (`TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000`). A JWT would need a nonce or `jti` claim management to achieve the same.

The HMAC scheme signs `userId:timestamp` with `INTERNAL_AUTH_SECRET`. Even if an attacker captures the headers, the signature is only valid for 5 minutes. After that, `verifyInternalHeaders()` rejects the timestamp.

Decision location: `packages/core/src/security/internal-auth.ts:3,14-29,39-68`.

### 7.4 Why `Promise.allSettled` for dashboard instead of `Promise.all`?

The dashboard aggregates three independent data sources: user profile, orders, and notifications. If the Notification Service is down, the user should still see their profile and recent orders.

`Promise.allSettled` never rejects. Each result is checked: `status === 'fulfilled'` → use value, `'rejected'` → use null and capture error message.

**What breaks without it**: If `Promise.all` were used and the Notification Service returned 500, the entire dashboard would fail with a 500 error despite user and order data being available.

Decision location: `src/modules/aggregation/dashboard.service.ts:27-38`.

### 7.5 Why Circuit Breaker at the HTTP client level instead of per-route?

The `BaseHttpClient.execute()` method applies `safeExecute` with a circuit breaker key implicitly set via the context string (`"Gateway HTTP: POST http://localhost:3008/..."`). This means each unique downstream endpoint gets its own circuit state.

If the Payment Service `/payments/charge` endpoint is failing, only that specific endpoint's circuit opens. Calls to `/payments/refund` on the same service continue normally.

The alternative — a single circuit per service — would block all Payment operations when only one endpoint is degraded.

Decision location: `src/common/http-client.ts:102-116`. The context string becomes the implicit circuit key in `safeExecute`.

### 7.6 Why `FAIL_CLOSE` as the default strategy for gateway proxying?

`FAIL_CLOSE` means: if the downstream call fails, throw the error to the caller. This is the safest default for an API gateway — the client gets an immediate error rather than stale or missing data.

`FAIL_OPEN` would return a fallback value (e.g., empty cart, zero balance), which could cause incorrect application state. `NON_BLOCKING` would silently swallow errors, hiding failures from monitoring.

Decision location: `src/common/http-client.ts:107` (`strategy: StrategyType.FAIL_CLOSE`).

### 7.7 Why Redis-backed throttling instead of in-memory?

When the gateway runs in multiple instances (horizontal scaling), in-memory rate limit counters are not shared. A client could send 100 requests to instance A and 100 to instance B, bypassing the limit.

Redis (`ThrottlerStorageRedisService`) provides a shared counter across all gateway instances. The `ttl: 60000` means each counter expires after 60 seconds, and the `limit: 100` caps requests per window.

Decision location: `src/app.module.ts:33-34` (ThrottlerModule config).

### 7.8 Why `@Public()` decorator instead of a whitelist config array?

A decorator keeps the "public" declaration co-located with the route handler. Reading the controller code, you can immediately see which routes skip auth.

A centralized whitelist config (e.g., `PUBLIC_ROUTES = ['/auth/*', '/products/*']`) separates the permission from the route definition, making it easy to accidentally add a protected route to the whitelist or forget to update the whitelist when adding a new route.

Decision location: `src/common/decorators/public.decorator.ts:13` (`SetMetadata(IS_PUBLIC_KEY, true)`).

### 7.9 Why two timeout layers (5000ms interceptor + 4000ms safeExecute)?

The `TimeoutInterceptor` (5000ms default) caps the total gateway handler time. The `safeExecute` timeout (4000ms) caps each individual downstream call.

This provides a 1000ms buffer: if the gateway handler takes 200ms for JSON parsing and guard checks, the downstream call still has 3800ms before the handler-level timeout fires. But if the handler does 3 serial downstream calls (unlikely but possible), each gets 4000ms individually while the total stays under 5000ms.

Decision locations: `src/common/interceptors/timeout.interceptor.ts:13` (default 5000) and `src/common/http-client.ts:108` (4000).

---

## 8. EDGE CASES TABLE

| Scenario | How Handled | Source Lines |
|---|---|---|
| `JWT_SECRET` not set at startup | `main.ts` throws `Error("Missing required environment variable: JWT_SECRET")` before `bootstrap()` | `main.ts:17-22` |
| `INTERNAL_AUTH_SECRET` not set at startup | Same validation loop | `main.ts:17-22` |
| `CORS_ORIGIN` not set in production | Throws `Error("CORS_ORIGIN is required in production")` | `main.ts:23-25` |
| Service URL not configured (undefined) | `forward()` throws 503 `HttpException("Service X is not configured")` | `gateway.controller.ts:249-253` |
| Aggregation dependency URL missing | Each BFF service checks all required URLs; throws 503 `"Aggregation dependencies not fully configured"` | `product-page.service.ts:21-25`, `cart-summary.service.ts:27-32`, `order-details.service.ts:19-24` |
| Empty cart (no items) | `CartSummaryService` returns `{ cart, enrichments: [] }` immediately, skipping enrichment calls | `cart-summary.service.ts:52-54` |
| One enrichment fails during cart aggregation | Per-item `try/catch` returns `{ item, product: null, inventory: null, error: "Enrichment failed" }` | `cart-summary.service.ts:67-81` |
| Order not found during order aggregation | After fetching order, if `orderData` is falsy, throws 404 `HttpException("Order Payload Empty")` | `order-details.service.ts:39-41` |
| Payment details unavailable | `try/catch` returns `{ status: "payment tracking unavailable" }` instead of failing the whole response | `order-details.service.ts:44-52` |
| Reviews service unavailable | `.catch(() => [])` returns empty array; product page still returns product + inventory | `product-page.service.ts:45-47` |
| Notification/User/Order failure in dashboard | `Promise.allSettled` captures per-service errors in `errors` object; each field independently null or error message | `dashboard.service.ts:27-62` |
| Circuit breaker OPEN | `execute()` catches error with message containing "Circuit breaker is OPEN", throws 503 `"Service Temporarily Unavailable (Fast Fallback)"` | `http-client.ts:119-127` |
| Downstream returns an error (AxiosError with response) | `execute()` re-throws as `HttpException` with the downstream status code and body | `http-client.ts:128-132` |
| Unknown error (not Axios, not circuit) | Throws 500 `HttpException("Internal Gateway Error")` | `http-client.ts:134` |
| Duplicate `x-request-id` (client sends one) | Middleware checks `if (!req.headers['x-request-id'])` — does NOT overwrite | `request-id.middleware.ts:8-9` |
| Handler exceeds 5000ms timeout | `TimeoutInterceptor` catches `TimeoutError`, throws `RequestTimeoutException("Request Timeout")` (408) | `timeout.interceptor.ts:18-22` |
| JWT payload missing `sub` field | `JwtStrategy.validate()` throws `UnauthorizedException` | `jwt.strategy.ts:35-37` |
| JWT token missing/invalid | Passport throws error; `handleRequest()` converts to `UnauthorizedException("Authentication failed")` | `jwt-auth.guard.ts:37-45` |
| Rate limit exceeded | `ThrottlerGuard` rejects with 429 Too Many Requests (NestJS default behavior) | `app.module.ts:29-40` (config) |
| Body exceeds 1 MB | Express rejects with 413 Payload Too Large | `main.ts:38-39` |
| `req.user` exists but `userId` is empty string | `signInternalHeaders` called only if `internalSecret && userId` (truthy check); empty string is falsy → falls through to fallback unsigned headers | `http-client.ts:73-85` |
| `req.user.roles` is a string (not array) | Handled explicitly: `Array.isArray(user.roles) ? user.roles : user.roles ? [user.roles] : []` | `http-client.ts:66-70` |
| HMAC timestamp outside 5-minute window | `verifyInternalHeaders` returns false; downstream `InternalAuthGuard` throws 401 | `packages/core/src/security/internal-auth.ts:52-54` |
| HMAC signature mismatch | `timingSafeEqual` returns false; guard rejects | `packages/core/src/security/internal-auth.ts:62-65` |

---

## 9. INTEGRATION POINT — Call Site with Inline Comments

The following is the actual proxy route handler for the Auth service, annotated line-by-line:

```typescript
// src/controllers/gateway.controller.ts:85-100

@ApiTags('Auth')                              // Groups in Swagger under "Auth"
@ApiOperation({
  summary: '🔓 Auth service proxy',           // 🔓 = public, no lock symbol in Swagger
  description:
    'Proxies all requests to the Auth Service (login, register, refresh, logout). No authentication required.',
})
@ApiResponse({ status: 200, description: 'Response from Auth Service' })
@Public()                                     // ← Metadata: skips JwtAuthGuard
@All('auth/*path')                            // ← Matches ANY HTTP method on /auth/*
async routeAuth(@Req() req: GatewayRequest) {
  return this.forward(
    // Argument 1: Auth service base URL from config
    // Example: "http://localhost:3001"
    this.configService.get<string>('gateway.services.auth'),

    // Argument 2: The full incoming Express request
    // Contains: method, url, headers, body, query, user (if authenticated)
    req,

    // Argument 3: Service prefix string for error messages
    // "auth" — used in the 503 message: "Service auth is not configured"
    'auth',
  );
}
```

And the `forwardRequest` method that handles header propagation and HMAC signing:

```typescript
// src/common/http-client.ts:36-97

async forwardRequest(
  targetUrl: string,                              // e.g. "http://localhost:3001/auth/login"
  req: Request,                                   // Full Express request
  additionalHeaders: Record<string, string> = {}, // Extra headers (unused in proxy routes)
): Promise<unknown> {
  const headers: Record<string, string> = {
    ...additionalHeaders,
  };

  // ── Traceability headers ──────────────────────────────────────────────
  // Propagate the request ID created by RequestIdMiddleware
  if (req.headers['x-request-id']) {
    headers['x-request-id'] = req.headers['x-request-id'] as string;
  }

  // Ensure x-correlation-id exists (for OTel/Jaeger trace correlation)
  // Priority: x-request-id > x-correlation-id > randomUUID()
  const correlationId =
    (req.headers['x-request-id'] as string) ||
    (req.headers['x-correlation-id'] as string) ||
    randomUUID();
  headers['x-correlation-id'] = correlationId;

  // ── Authentication propagation ────────────────────────────────────────
  // Forward the client's Bearer token so downstream services can verify it
  if (req.headers.authorization) {
    headers.authorization = req.headers.authorization;
  }

  // ── Identity signing (service-to-service auth) ────────────────────────
  // If JwtAuthGuard decoded the JWT and attached req.user, sign the identity
  if (req.user) {
    const user = req.user as { userId?: string; roles?: string[] | string };
    const userId = user.userId || '';

    // Normalize roles: array → use as-is, string → wrap in array, missing → []
    const roles = Array.isArray(user.roles)
      ? user.roles
      : user.roles
        ? [user.roles]
        : [];

    const internalSecret = process.env.INTERNAL_AUTH_SECRET;
    if (internalSecret && userId) {
      // Production path: HMAC-sign identity headers
      // signInternalHeaders creates:
      //   x-user-id, x-user-roles, x-internal-timestamp, x-internal-signature
      const signedHeaders = signInternalHeaders(
        userId,          // "usr-42"
        roles,           // ["customer"]
        internalSecret,  // shared INTERNAL_AUTH_SECRET
      );
      Object.assign(headers, signedHeaders);
    } else {
      // Fallback (dev mode): forward identity without HMAC
      // Downstream services should still verify with InternalAuthGuard
      if (userId) headers['x-user-id'] = userId;
      if (roles.length > 0) headers['x-user-roles'] = roles.join(',');
    }
  }

  // ── Build Axios config ────────────────────────────────────────────────
  const config: AxiosRequestConfig = {
    method: req.method,       // Preserve original HTTP method (GET, POST, etc.)
    url: targetUrl,           // Full downstream URL
    headers,                  // Propagated + signed headers
    data: req.method !== 'GET' ? (req.body as unknown) : undefined,  // Forward body for mutating requests
    params: req.query,        // Forward query parameters
  };

  // Execute with resilience: circuit breaker, timeout, error handling
  return this.execute(config);
}
```

---

## 10. FILE MAP

```
apps/api-gateway/
├── .env.example                          # Template for all required environment variables
├── .prettierrc                           # Code formatting config
├── Dockerfile                            # Multi-stage build: deps → build → production
├── eslint.config.mjs                     # ESLint flat config
├── nest-cli.json                         # NestJS CLI: webpack bundling, delete out dir
├── package.json                          # Dependencies: NestJS, Passport, ioredis, Axios, etc.
├── tsconfig.json                         # TypeScript config extending base
├── tsconfig.build.json                   # TypeScript build config (excludes tests)
├── test/
│   └── app.e2e-spec.ts                   # E2E test: boots AppModule, tests GET / returns 200
└── src/
    ├── main.ts                           # Bootstrap: env validation, tracing init, NestFactory.create, global middleware
    ├── app.module.ts                     # Root module: imports, controllers, guards, interceptors, Redis provider
    ├── config/
    │   └── gateway.config.ts             # registerAs('gateway', ...): port, CORS, timeout, Redis, 9 service URLs, JWT secret
    ├── controllers/
    │   ├── gateway.controller.ts         # 9 proxy routes (All) + 3 BFF routes (product-page, cart-summary, order-details)
    │   └── health.controller.ts          # GET /health (liveness) + GET /health/ready (Redis ping readiness)
    ├── middleware/
    │   └── request-id.middleware.ts      # Injects UUID x-request-id if missing; sets response header
    ├── modules/
    │   └── aggregation/
    │       ├── aggregation.module.ts     # Bundles 4 services + 1 controller; exports 3 services for GatewayController
    │       ├── cart-summary.service.ts   # BFF: cart → concurrent product+inventory enrichment per item
    │       ├── dashboard.service.ts      # BFF: Promise.allSettled for user + orders + notifications
    │       ├── order-details.service.ts  # BFF: order → payment details with graceful payment failure
    │       ├── product-page.service.ts   # BFF: Promise.all for product + inventory + reviews (reviews optional)
    │       └── user-dashboard.controller.ts  # GET /user-dashboard (JWT required)
    └── common/
        ├── constants.ts                  # DI token: REDIS_CLIENT = 'REDIS_CLIENT'
        ├── http-client.module.ts         # Registers HttpModule (Axios) with configurable timeout
        ├── http-client.ts                # BaseHttpClient: forwardRequest, directGet, execute with safeExecute
        ├── types.ts                      # GatewayRequest extends Express Request with req.user
        ├── decorators/
        │   └── public.decorator.ts       # @Public() = SetMetadata('isPublic', true)
        ├── filters/
        │   └── all-exceptions.filter.ts  # Local exception filter (catch-all, formats error response)
        ├── guards/
        │   ├── jwt-auth.guard.ts         # APP_GUARD: validates JWT, skips if @Public()
        │   └── jwt.strategy.ts           # Passport strategy: ExtractJwt.fromAuthHeaderAsBearerToken()
        └── interceptors/
            ├── logging.interceptor.ts    # Local logging interceptor (unused; package version used globally)
            └── timeout.interceptor.ts    # APP_INTERCEPTOR: RxJS timeout(5000ms) per request

packages/core/src/
├── index.ts                              # Re-exports all core submodules
├── filters/
│   ├── global-exception.filter.ts        # Global exception filter: StandardErrorResponse + OTel spans
│   ├── index.ts
│   └── __tests__/
├── interceptors/
│   ├── http-logging.interceptor.ts       # HTTP logging: [correlationId] METHOD /path STATUS — userAgent [latencyMs]
│   ├── metrics.interceptor.ts            # Prometheus: http_request_total, http_request_duration_seconds, http_request_errors_total
│   ├── index.ts
│   └── __tests__/
├── security/
│   ├── internal-auth.ts                  # signInternalHeaders() + verifyInternalHeaders() with HMAC-SHA256
│   ├── internal-auth.guard.ts            # InternalAuthGuard: verifies HMAC headers in downstream services
│   └── index.ts
├── resilience/
│   ├── safe-execute.ts                   # Main API: composes timeout → retry → circuit breaker → strategy
│   ├── strategies.ts                     # StrategyType enum + applyStrategy()
│   ├── circuit-breaker.ts                # Per-key circuit breaker with CLOSED/OPEN/HALF_OPEN states
│   ├── retry.ts                          # Exponential backoff with ±25% jitter
│   ├── timeout.ts                        # Promise.race with setTimeout
│   └── index.ts
├── observability/
│   ├── tracing.ts                        # initTracing(): OpenTelemetry SDK with OTLP exporter
│   ├── logging.ts                        # getLoggerModule(): Pino logger with pretty-print in dev
│   ├── metrics.ts                        # MetricsModule: Prometheus at /metrics
│   └── index.ts
├── kafka/
│   ├── correlation.ts
│   ├── dlq-producer.ts
│   ├── kafka-resilient.ts
│   └── index.ts
└── persistence/
    └── (database utilities)

packages/events/src/
├── index.ts                              # Re-exports all event types
├── envelope.ts                           # Event envelope wrapper (metadata + payload)
├── cart.events.ts                        # CartCreated, CartUpdated, CartItemAdded, etc.
├── inventory.events.ts                   # InventoryReserved, InventoryReleased, etc.
├── notification.events.ts                # NotificationSent, NotificationFailed
├── order.events.ts                       # OrderCreated, OrderStatusUpdated, etc.
├── payment.events.ts                     # PaymentProcessed, PaymentFailed, PaymentRefunded
├── product.events.ts                     # ProductCreated, ProductUpdated, ProductDeleted
└── user.events.ts                        # UserCreated, UserUpdated, UserDeleted
```

---

> **Document version**: 1.0 — generated from source at `apps/api-gateway/src/` and `packages/core/src/`, `packages/events/src/`
