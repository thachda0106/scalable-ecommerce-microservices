# API Gateway Architecture

## Overview
The API Gateway serves as the centralized entry point for the scalable e-commerce microservices platform. It is intentionally designed as a "thin" layer, strictly enforcing structural separation by avoiding any domain-specific business logic. Its primary responsibilities include request orchestration, security enforcement, traffic management, and resilience.

## Core Responsibilities
1. **Routing & Proxying:** Directing incoming requests to the appropriate downstream microservices based on URL routing logic.
2. **Authentication Verification:** Validating JSON Web Tokens (JWTs) and extracting user identity to be propagated to downstream services.
3. **Request Aggregation:** Providing composite endpoints that orchestrate concurrent calls to multiple backend services to serve rich client experiences (e.g., product details, shopping cart summary).
4. **Resilience & Traffic Control:** Enforcing global rate limits to prevent abuse and implementing circuit breaking and timeouts to safeguard against cascading downstream failures.
5. **Observability:** Stamping all incoming requests with a trace ID (`x-request-id`) to facilitate distributed tracing across the platform.

## Request Flow

Every incoming HTTP request traverses a strict pipeline of middleware, guards, and interceptors before being routed to a backend service or aggregation handler.

1. **Request Tracing (Middleware):** 
   - `RequestIdMiddleware` checks for an existing `x-request-id` header.
   - If missing, a new UUID v4 is generated.
   - This ID is attached to the request and automatically propagated in the headers of all downstream HTTP calls via the `BaseHttpClient`.

2. **Rate Limiting (Global Guard):**
   - The NestJS `ThrottlerGuard` is applied globally.
   - It restricts the number of requests permitted from a single IP address within a specific time window, defending against DDoS and brute-force attacks.

3. **Authentication Verification (Guard):**
   - Certain global routes (like `/auth/*`) bypass this step.
   - For all other requests, the `JwtAuthGuard` intercepts the request.
   - The `JwtStrategy` validates the bearer token against the central `JWT_SECRET`.
   - Upon successful verification, the parsed payload (User ID, Roles) is attached to the NestJS request object.

4. **Proxy / Aggregation (Controller):**
   - The `GatewayController` routes the request.
   - **Direct Proxying:** Wildcard routes match specific domain prefixes (e.g., `/users/*`, `/orders/*`) and forward the exact URL path to the mapped downstream service URL.
   - **Aggregation Endpoints:** Specific endpoints trigger internal aggregation services (e.g., `CartSummaryService`) to fetch data from multiple sources concurrently.

## Authentication Boundary & Handoff
The API Gateway acts as the strict authentication boundary for the microservices ecosystem. Backend domain services (like User, Inventory, Order) trust the Gateway to have already verified the user's identity.

- **Token Validation:** The Gateway explicitly verifies the JWT signature and expiration.
- **Identity Propagation:** The Gateway unpacks the JWT payload and injects identity headers into the forwarded request.
  - `x-user-id`
  - `x-user-roles`
- **Downstream Trust:** Domain services read these `x-user-*` headers directly for authorization decisions (e.g., checking if the requester owns the order resource) rather than re-validating the JWT.

## Request Aggregation
To reduce client-side latency and the number of network roundtrips, the Gateway provides composite endpoints that stitch together data from disjointed domains.

- `GET /product-page/:id`: Aggregates the core product details (Product Service), current stock levels (Inventory Service), and user ratings (Review Service).
- `GET /cart-summary`: Takes the raw cart item list and enriches each item with the current name, price, and stock availability by concurrently pinging Product and Inventory services.
- `GET /order-details/:id`: Fetches the core order placement details and stitches the related payment status history.

Aggregation logic utilizes `Promise.all` via the `BaseHttpClient` for optimal concurrency.

## Resilience Patterns
To isolate failures and ensure platform stability, the API Gateway employs strong resilience controls on all outgoing requests.

### Timeouts
- A global `TimeoutInterceptor` wraps every incoming Gateway request in an RxJS `timeout()` operator.
- If a request (including all downstream proxying and aggregation time) exceeds a strict 5000ms threshold, the Gateway terminates the connection and immediately returns an HTTP 408 Request Timeout to the client. This prevents hung connections from exhausting Gateway resources.

### Circuit Breaking
- The `BaseHttpClient` wraps all HTTP operations in an `opossum` Circuit Breaker.
- **Protection:** If a specific downstream service begins to slow down or fail excessively, the circuit breaker "opens," instantly failing fast and returning HTTP 503 Service Unavailable for subsequent requests intended for that service.
- **Recovery:** A half-open state periodically tests if the backend service has recovered before fully closing the circuit and allowing normal traffic flow.
- This pattern completely prevents a cascading failure (e.g., a locked database in the Inventory Service) from consuming all connection pools and bringing down the entire API Gateway.
