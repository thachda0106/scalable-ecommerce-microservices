# System Overview

> **Audience:** Every engineer on the team. Read this before writing any code.

---

## What We're Building

A large-scale **E-Commerce Microservices Platform** — a backend system that powers online retail
operations including product catalog management, user accounts, shopping cart, order processing,
payment handling, inventory tracking, search, and automated notifications.

---

## Business Context

```
Customer Journey:
  Browse/Search products → Add to cart → Checkout → Pay → Receive confirmation

Admin Journey:
  Manage products → Manage inventory → View orders → Process refunds

Platform Must Handle:
  - 10K+ concurrent users
  - 3,000+ orders/minute at peak (flash sales)
  - Sub-300ms API response times (p95)
  - 99.95% availability (< 22 minutes downtime/month)
  - Multi-tenant marketplace model
```

---

## High-Level Architecture

```
                    ┌──────────────────┐
                    │   CloudFront     │ ← CDN (static assets, images)
                    │   + WAF          │ ← Web Application Firewall
                    └────────┬─────────┘
                             │
                    ┌────────┴─────────┐
                    │   ALB (HTTPS)    │ ← Load Balancer (public subnet)
                    └────────┬─────────┘
                             │
                    ┌────────┴─────────┐
                    │   API Gateway    │ ← Auth validation, rate limiting,
                    │   Service        │   correlation IDs, routing
                    └────────┬─────────┘
                             │
          ┌──────────────────┼──────────────────────┐
          │                  │                      │
    ┌─────┴─────┐    ┌──────┴──────┐     ┌─────────┴───────┐
    │   Auth    │    │   Product   │     │     Order       │
    │   User    │    │   Search    │     │   Inventory     │
    │           │    │   Cart      │     │   Payment       │
    └─────┬─────┘    └──────┬──────┘     │   Notification  │
          │                 │            └─────────┬───────┘
          │                 │                      │
    ┌─────┴─────────────────┴──────────────────────┴─────┐
    │                    Kafka (MSK)                      │
    │           Async Event Backbone                      │
    └────────────────────────┬───────────────────────────┘
                             │
    ┌────────────────────────┼────────────────────────┐
    │                        │                        │
    ▼                        ▼                        ▼
  PostgreSQL              Redis                  OpenSearch
  (per service)           (cache, cart,           (product search)
                           sessions)
```

---

## 10 Microservices

| # | Service | Port | Database | Purpose |
|---|---------|------|----------|---------|
| 1 | **API Gateway** | 3000 | — | Single entry point: routing, auth, rate limit |
| 2 | **Auth Service** | 3001 | Redis | JWT tokens, login/register, token blacklist |
| 3 | **User Service** | 3002 | PostgreSQL | User profiles, addresses |
| 4 | **Product Service** | 3003 | PostgreSQL | Product catalog (CQRS write side) |
| 5 | **Search Service** | 3004 | OpenSearch | Full-text search (CQRS read side) |
| 6 | **Cart Service** | 3005 | Redis | Shopping cart (ephemeral) |
| 7 | **Order Service** | 3006 | PostgreSQL | Order lifecycle, Saga orchestrator |
| 8 | **Inventory Service** | 3007 | PostgreSQL | Stock levels, reservations (OCC) |
| 9 | **Payment Service** | 3008 | PostgreSQL | Payment processing, refunds |
| 10 | **Notification Service** | 3009 | — | Email/SMS via event consumption |

---

## Technology Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Language** | TypeScript (Node.js 24) | Type safety, team expertise |
| **Framework** | NestJS v11 | Modular, DI, enterprise patterns |
| **ORM** | TypeORM | NestJS-native, migrations, multi-DB |
| **Monorepo** | pnpm workspaces | Workspace linking, fast installs |
| **Shared Packages** | `@ecommerce/core`, `events`, `shared-types` | Reusable infrastructure code |
| **Relational DB** | PostgreSQL 16 (RDS) | ACID, JSON support, mature |
| **Cache** | Redis 7 (ElastiCache) | Sub-ms reads, pub/sub, data structures |
| **Search** | OpenSearch 2.11 | Full-text, facets, suggestion |
| **Message Broker** | Kafka 3.5 (MSK) | Ordered, durable, replayable events |
| **Container** | Docker + ECS Fargate | Serverless containers, auto-scaling |
| **IaC** | Terraform 1.6+ | Reproducible infrastructure |
| **CI/CD** | GitHub Actions | Native repo integration |
| **Observability** | OpenTelemetry + Prometheus + CloudWatch | Vendor-neutral, industry standard |
| **CDN** | CloudFront | Global edge, S3/ALB integration |
| **WAF** | AWS WAFv2 | SQLi/XSS/rate limiting |
| **Secrets** | AWS Secrets Manager | Rotation, ECS native injection |

---

## Key Architectural Patterns

| Pattern | Where Used | Why |
|---------|-----------|-----|
| **Database per Service** | All services | Data isolation, independent scaling |
| **Transactional Outbox** | All publishers | Atomic DB write + event publish |
| **Inbox (Dedup)** | All consumers | Exactly-once event processing |
| **CQRS** | Product → Search | Separate write (PG) from read (OpenSearch) |
| **Orchestrated Saga** | Checkout flow | Distributed transaction with compensation |
| **Circuit Breaker** | All external calls | Prevent cascade failures |
| **Rate Limiting** | API Gateway | Protect against abuse |
| **JWT + RBAC** | All services | Stateless auth with role control |
| **Multi-Tenancy** | Row-level (tenantId) | Single deployment, multiple tenants |

---

## Communication Patterns

```
Synchronous (HTTP):
  Client → API Gateway → Backend Service
  Used for: queries that need immediate response (GET product, GET user)

Asynchronous (Kafka Events):
  Service A → Outbox → Outbox Relay → Kafka → Inbox → Service B
  Used for: state changes (order created, stock reserved, payment processed)

Rule: NEVER chain synchronous calls across services.
  ❌ Order → HTTP → Inventory → HTTP → Payment
  ✅ Order → Kafka → Inventory → Kafka → Payment (Saga)
```

---

## Checkout Flow (The Most Complex Flow)

```
1. Client → POST /api/orders (via API Gateway)
2. Order Service creates order (status: CREATED)
3. Order Service publishes ReserveStock via Outbox
4. Inventory Service consumes → reserves stock with OCC
5. Inventory Service publishes StockReserved via Outbox
6. Order Service consumes → updates status to STOCK_RESERVED
7. Order Service publishes ProcessPayment via Outbox
8. Payment Service consumes → charges via Stripe
9. Payment Service publishes PaymentProcessed via Outbox
10. Order Service consumes → updates status to CONFIRMED
11. Order Service publishes OrderConfirmed via Outbox
12. Notification Service consumes → sends confirmation email

Compensation (if payment fails):
  8b. Payment Service publishes PaymentFailed
  9b. Order Service publishes ReleaseStock
  10b. Inventory Service releases reserved stock
  11b. Order Service marks order FAILED
  12b. Notification Service sends failure notification
```

---

## Infrastructure

```
AWS Region: ap-southeast-1 (Singapore)

VPC: 10.0.0.0/16
├── Public Subnets  (10.0.1-3.0/24)  → ALB, NAT Gateway
├── Private Subnets (10.0.11-13.0/24) → ECS Fargate tasks
└── Data Subnets    (10.0.21-23.0/24) → RDS, Redis, Kafka, OpenSearch

Security: Layered security groups (ALB → ECS → Data)
Compute: ECS Fargate with auto-scaling (CPU + request count)
State: Terraform remote state in S3 with DynamoDB locking
Environments: dev, staging, prod (same Terraform, different vars)
```

---

## How to Navigate This Handbook

| You want to... | Read |
|----------------|------|
| Understand the full system | This document + [Architecture Diagrams](./architecture-diagrams.md) |
| See all API endpoints | [Service Catalog](./service-catalog.md) |
| See all events | [Event Catalog](./event-catalog.md) |
| Trace a request end-to-end | [Request Flows](./request-flows.md) |
| Set up infrastructure | [Phase 04](../phases/04-infrastructure.md) |
| Build a new service | [Phase 05](../phases/05-platform-core.md) + [Phase 06](../phases/06-microservices-design.md) |
| Deploy a change | [Deployment Flow](./deployment-flow.md) |
| Handle a production incident | [Runbooks](./runbooks.md) |
| Prepare for launch | [Production Checklist](./production-checklist.md) |
