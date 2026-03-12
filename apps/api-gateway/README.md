# API Gateway

This is the API Gateway service for the scalable e-commerce microservices platform. It acts as the fortified, single entry point for all client applications. Wait, this gateway is designed to be **thin**—it contains no domain business logic. Instead, it strictly handles transport-layer orchestration, resilience, and security.

## Built With
- **NestJS** (Express underlying)
- **Axios & RxJS** (Proxying & Timeouts)
- **Opossum** (Circuit Breakers)
- **Passport JWT** (Token Verification)
- **Redis** (Rate Limiting)

## Features & Responsibilities

1. **Proxy Routing:** Forwarding requests using wildcard routes (`/users/*`, `/products/*`) to corresponding internal microservices.
2. **Distributed Tracing:** Auto-generating and propagating `x-request-id` headers for end-to-end observability.
3. **Security Boundary:** 
   - Global `JwtAuthGuard` validates all incoming access tokens (except public routes like `/auth/*`).
   - Unpacks identity into `x-user-id` and `x-user-roles` HTTP headers that domain services natively consume.
4. **Traffic & Resilience Management:**
   - **Rate Limiting:** Protects against abuse via a Redis-backed Throttler (100 req/min limit per IP).
   - **Timeouts:** Global 5000ms termination window for all processed traffic.
   - **Circuit Breaking:** Guards proxy calls with Opossum; drops traffic rapidly (503s) if a downstream service like Inventory or Order degrades, preventing cascading connection pool exhaustion.
5. **Request Aggregation:** Concurrent `Promise.all` orchestration to merge data from disjointed domains into single client-friendly payloads:
   - `GET /cart-summary`: Cart list + Product Names/Prices + Stock Levels
   - `GET /product-page/:id`: Product Specs + Stock levels + Reviews
   - `GET /order-details/:id`: Core Order data + Payment traces

## Documentation
For an in-depth look at how the request flow works and the lack of domain modeling, see the architectural guide:
- [API Gateway Architecture Document](../../docs/api-gateway-architecture.md)

## Development Setup

```bash
# From the repository root
$ npm install
```

## Running the app

```bash
# Start just the gateway
$ npm run start:dev --prefix apps/api-gateway
```
