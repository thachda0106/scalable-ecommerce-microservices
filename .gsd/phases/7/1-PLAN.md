# Phase 7: Production-Grade API Gateway Implementation Plan

## 1. Updated API Gateway Architecture

The API Gateway will act as the robust, single entry point for the microservices platform, fully leveraging NestJS features to secure, route, and aggregate requests.

**Core Request Lifecycle:**
1. **Client Request** -> API Gateway (NLB/ALB usually fronting it)
2. **Global Middleware**: Request ID generation, initial structured logging.
3. **Global Rate Limiter (Redis)**: Checks request limits based on IP or client API key.
4. **Global Guards (Auth)**: JWT validation; extracts user claims, denies unauthorized requests.
5. **Global Interceptors**: 
   - Observability: Starts OpenTelemetry spans, records Prometheus metrics.
   - Resilience: Global timeouts ensuring no request hangs indefinitely.
6. **Exception Filters**: Catches untrapped errors and normalizes them into standardized JSON formats.
7. **Controllers / Aggregators**:
   - Simple Proxy (e.g. `/orders -> order-service` via `@nestjs/axios` or `@nestjs/microservices`).
   - Aggregators (e.g. `/user-dashboard` fetching from User, Order, Notification services concurrently).
8. **Response / Error Normalized** -> Delivered to Client.

## 2. Target Folder Structure

```text
apps/api-gateway/src/
├── app.module.ts              # Root module configuring global providers & imports
├── main.ts                    # Bootstrap with Global Filters, Interceptors, Pipes
├── config/
│   └── gateway.config.ts      # Downstream service URLs and generic settings
├── common/
│   ├── filters/
│   │   └── all-exceptions.filter.ts # Standardized error normalization
│   ├── interceptors/
│   │   ├── logging.interceptor.ts   # Structured request/response logging
│   │   ├── timeout.interceptor.ts   # Resilience: Request timeouts
│   └── guards/
│       └── jwt-auth.guard.ts        # Central JWT validation & context building
├── modules/
│   ├── proxy/                       # Standard downstream routing
│   │   ├── proxy.module.ts
│   │   ├── proxy.controller.ts      # Wildcard route handlers (/api/v1/services...)
│   │   └── proxy.service.ts         # Axios-based forwarding with retry & circuit-breaking
│   └── aggregation/                 # Complex API composition 
│       ├── aggregation.module.ts
│       ├── user-dashboard.controller.ts
│       └── dashboard.service.ts     # Composes parallel calls to User, Order, Notification
└── app.controller.ts          # Simple health checks (/health)
```

## 3. Task Breakdown for Implementation

- **Task 1: Core Scaffolding & Dependencies**
  - Install dependencies (`@nestjs/axios`, `redis`, `@nestjs/throttler`, generic auth libraries).
  - Define environment variables mapped to all 8 downstream service URLs.

- **Task 2: Rate Limiting & Overload Protection (Redis)**
  - Integrate `@nestjs/throttler` backed by a Redis storage provider (`throttler-storage-redis`).
  - Apply global throttling limits (e.g., 100 req/min/IP).

- **Task 3: Authentication Layer & Identity Propagation**
  - Implement `JwtAuthGuard` reading the Bearer token or authorization header.
  - Verify token using the secret/JWKS.
  - Inject the decoded payload elements like `x-user-id` and `x-user-roles` as downstream HTTP headers.

- **Task 4: Cross-Cutting Observability**
  - Add request logging middleware to trace request origins, routes, and execution times.
  - Hook into the `@ecommerce/core` logger and OpenTelemetry instrumentation for distributed tracing.

- **Task 5: Route Forwarding & Proxy Layer**
  - Implement a `proxy.service.ts` to forward request methods, query params, heavily sanitized bodies, and enriched identity headers to designated downstream URLs.
  - Map specific prefixes (`/auth`, `/users`, `/products`, etc.) to respective Docker container hostnames.

- **Task 6: Resilience Patterns**
  - Implement a global `TimeoutInterceptor`.
  - Equip proxied outgoing HTTP calls to downstream services with RxJS `retry` logic and standard Circuit Breakers to shed load automatically if downstream degrades.

- **Task 7: Standardized APIs & Exception Filters**
  - Implement an `AllExceptionsFilter` for uniform `{ statusCode, message, path, timestamp }` JSON error enforcement across the platform.

- **Task 8: API Aggregation (`/user-dashboard`)**
  - Implement the `user-dashboard.controller.ts`.
  - Issue safe concurrent parallel HTTP requests to `user-service`, `order-service`, and `notification-service`.
  - Handle partial degradation (e.g., if notifications are down, return the dashboard strictly with user + orders but null notifications).

## 4. Example Request Flow: `/user-dashboard`

1. **Client** calls `GET /user-dashboard` with `Authorization: Bearer <token>`.
2. **ThrottlerGuard** checks Redis. If within limits, passes request.
3. **JwtAuthGuard** decodes the JWT and validates the signature. Extracts `userId: 123` and bounds it to the request context.
4. **DashboardService** fires concurrent internal requests:
   - `GET http://user-service:3002/users/123`
   - `GET http://order-service:3006/orders?userId=123`
   - `GET http://notification-service:3009/notifications?userId=123`
   *(All internal proxy requests are augmented with headers: `x-user-id: 123` & `traceparent`)*
5. **DashboardService** waits for promises safely (e.g., using `Promise.allSettled`).
6. **Data Transformation**: Combines the output: `{ user: {...}, recentOrders: [...], unreadNotifications: 2 }`.
7. **Client** receives the aggregated unified HTTP 200 payload.

## 5. Production Best Practices

- **Zero Trust**: Do not expose internal service IPs directly to the load balancer level; exclusively route traffic through this API Gateway. Sanitize inbound requests immediately.
- **Fail Fast**: Never let a slow downstream service (e.g., Inventory taking 10s to respond) exhaust gateway threads. Enforce strict tight timeouts (<2s) and employ Circuit Breakers to immediately reject requests if a service is explicitly down.
- **Observability Continuity**: Seamlessly maintain the `traceId` distributed trace identifier across the gateway into downstream services through W3C context headers.
- **Stateless & Scalable**: Run horizontal replicas of the API Gateway behind a highly available ALB. Depend completely on Redis for state coordination (Rate Limits, Distributed Locks, Session caches).
- **Graceful Degradation**: When aggregating responses (like user, order, notification logic), if notification-service times out, still return the bulk of the valid dashboard payload to the user rather than throwing a catastrophic 500 error.
