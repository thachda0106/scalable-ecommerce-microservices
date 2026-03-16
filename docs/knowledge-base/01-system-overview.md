# Section 1 — System Overview

## What the System Does

This is an **Amazon-scale distributed e-commerce platform** designed to handle 50M+ products and 3,000+ TPS order throughput. It provides the full buyer journey: user registration/authentication, product browsing/searching, cart management, checkout with inventory reservation, payment processing, order lifecycle management, and notifications.

## Key Business Domains

| Domain | Bounded Context | Service |
|--------|----------------|---------|
| **Identity & Access** | Authentication, JWT lifecycle, OAuth, session management | Auth Service |
| **Customer Management** | User profiles, addresses, settings, account lifecycle | User Service |
| **Product Catalog** | Product CRUD, pricing, attributes, categories (write model) | Product Service |
| **Product Discovery** | Full-text search, autocomplete, faceted filtering (read model) | Search Service |
| **Shopping Cart** | Ephemeral cart state, item management, expiration | Cart Service |
| **Order Management** | Order lifecycle, saga orchestration, state machine | Order Service |
| **Inventory Control** | Stock levels, reservations, oversell prevention, replenishment | Inventory Service |
| **Payment Processing** | Payment gateway integration, refunds, idempotency | Payment Service |
| **Communications** | Order confirmations, failure notifications, multi-channel delivery | Notification Service |

## Why Microservices Were Chosen

1. **Independent scaling** — Cart and Search need horizontal scaling during flash sales; Payment needs isolation for PCI compliance.
2. **Domain isolation** — Each bounded context owns its data store (Database-per-Service pattern), preventing cross-domain coupling.
3. **Technology heterogeneity** — Search uses OpenSearch, Cart uses Redis, others use PostgreSQL — each optimized for its workload.
4. **Team autonomy** — Services can be developed, deployed, and scaled independently by separate teams.
5. **Fault isolation** — A failure in Notification Service does not affect checkout flow.

## High-Level System Responsibilities

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser/Mobile)                   │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTPS
                    ┌──────────▼──────────┐
                    │    API Gateway       │  Port 3000
                    │  (JWT Auth, Rate     │  - Request routing
                    │   Limiting, BFF      │  - HMAC header signing
                    │   Aggregation)       │  - Swagger documentation
                    └──────────┬──────────┘
                               │ HTTP (internal)
         ┌─────────────┬──────┴──────┬──────────────┬─────────────┐
         ▼             ▼             ▼              ▼             ▼
   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
   │   Auth   │  │   User   │  │ Product  │  │  Search  │  │   Cart   │
   │  :3001   │  │  :3002   │  │  :3003   │  │  :3004   │  │  :3005   │
   └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘
        │              │             │              │             │
   ┌────▼─────┐  ┌────▼─────┐  ┌────▼─────┐  ┌────▼─────┐  ┌────▼─────┐
   │  Redis   │  │ Postgres │  │ Postgres │  │OpenSearch│  │  Redis   │
   └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘

         ┌─────────────┬─────────────┬─────────────┐
         ▼             ▼             ▼             ▼
   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
   │  Order   │  │Inventory │  │ Payment  │  │ Notify   │
   │  :3006   │  │  :3007   │  │  :3008   │  │  :3009   │
   └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────────┘
        │              │             │            (no DB)
   ┌────▼─────┐  ┌────▼─────┐  ┌────▼─────┐
   │ Postgres │  │ Postgres │  │ Postgres │
   └──────────┘  └──────────┘  └──────────┘

              ┌─────────────────────────┐
              │    Apache Kafka         │
              │  (Event Bus / EDA)      │
              └─────────────────────────┘
```

## Service Boundaries

Each service strictly owns its:
- **Database schema** — no shared tables across services
- **Domain model** — entities, value objects, domain events
- **API surface** — REST endpoints exposed through the gateway
- **Kafka topics** — produces to its own topics, consumes from others
- **Deployment unit** — independent Docker container on ECS Fargate

---

# Section 2 — Infrastructure Architecture

## Full Infrastructure Stack

### AWS Production Architecture (Terraform-managed)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AWS Cloud (us-east-1)                        │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                           VPC (10.0.0.0/16)                      │ │
│  │                                                                   │ │
│  │  ┌──────────────────────┐  ┌──────────────────────┐             │ │
│  │  │   Public Subnet AZ1  │  │   Public Subnet AZ2  │             │ │
│  │  │  ┌────────────────┐  │  │  ┌────────────────┐  │             │ │
│  │  │  │  NAT Gateway   │  │  │  │  NAT Gateway   │  │             │ │
│  │  │  └────────────────┘  │  │  └────────────────┘  │             │ │
│  │  │  ┌─────────────────────────────────────────┐   │             │ │
│  │  │  │        Application Load Balancer         │   │             │ │
│  │  │  │      (HTTPS/443 → Target Groups)        │   │             │ │
│  │  │  └─────────────────────────────────────────┘   │             │ │
│  │  └──────────────────────┘  └──────────────────────┘             │ │
│  │                                                                   │ │
│  │  ┌──────────────────────┐  ┌──────────────────────┐             │ │
│  │  │  Private Subnet AZ1  │  │  Private Subnet AZ2  │             │ │
│  │  │                      │  │                      │             │ │
│  │  │  ┌─── ECS Fargate ──────────── ECS Fargate ─┐ │             │ │
│  │  │  │  api-gateway       │  │  auth-service      │ │             │ │
│  │  │  │  user-service      │  │  product-service   │ │             │ │
│  │  │  │  search-service    │  │  cart-service      │ │             │ │
│  │  │  │  order-service     │  │  inventory-service │ │             │ │
│  │  │  │  payment-service   │  │  notification-svc  │ │             │ │
│  │  │  └────────────────────┘  └────────────────────┘ │             │ │
│  │  │                                                  │             │ │
│  │  │  ┌─── Data Layer ──────────────────────────────┐│             │ │
│  │  │  │  Aurora Serverless v2 (orders_db)            ││             │ │
│  │  │  │  Aurora Serverless v2 (users_db)             ││             │ │
│  │  │  │  Aurora Serverless v2 (products_db)          ││             │ │
│  │  │  │  ElastiCache Redis (r7g.large, 3 shards)    ││             │ │
│  │  │  │  MSK Kafka (m5.large, 3 brokers)            ││             │ │
│  │  │  │  OpenSearch (m5.large, 3 nodes)             ││             │ │
│  │  │  └──────────────────────────────────────────────┘│             │ │
│  │  └──────────────────────┘  └──────────────────────┘             │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌─── Supporting Services ──────────────────────────────────────────┐│
│  │  S3 (Terraform state)  │  Secrets Manager  │  CloudWatch/SNS     ││
│  └──────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

### How Requests Travel

1. **Client → ALB**: HTTPS request hits the Application Load Balancer (ACM-managed TLS certificate).
2. **ALB → API Gateway**: Routes to ECS Fargate task running the API Gateway (port 3000).
3. **API Gateway authenticates**: JwtAuthGuard validates the Bearer token using `passport-jwt`. Public routes (`@Public()`) skip auth.
4. **API Gateway rate-limits**: ThrottlerGuard (backed by Redis) enforces 100 req/min per IP.
5. **API Gateway forwards**: `BaseHttpClient.forwardRequest()` proxies to the downstream service URL, injecting HMAC-signed headers (`x-user-id`, `x-internal-signature`, `x-internal-timestamp`).
6. **Downstream service validates**: `InternalAuthGuard` verifies the HMAC signature using a shared `INTERNAL_AUTH_SECRET`, with 5-minute timestamp tolerance for replay protection.
7. **Service processes**: Business logic executes, persists to its database, writes outbox events.
8. **Outbox relay**: Background worker polls `outbox_events` table, publishes to Kafka, marks as processed.
9. **Response flows back**: Service → API Gateway → ALB → Client.

### Networking Layers

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Public** | ALB + Internet Gateway | Accepts external HTTPS traffic |
| **Private** | NAT Gateway per AZ | Outbound internet for private subnets |
| **Security Groups** | ECS shared SG → data layer SGs | Whitelist-based access control |
| **VPC Flow Logs** | CloudWatch Logs | Network traffic auditing |

### Internal Service Communication

| Pattern | When Used | Implementation |
|---------|----------|----------------|
| **Synchronous HTTP** | API Gateway → downstream services | `BaseHttpClient` (Axios) with timeout interceptor |
| **Asynchronous Events** | Inter-service domain events | Apache Kafka (KafkaJS) with Transactional Outbox |
| **BFF Aggregation** | Cross-service data composition | API Gateway aggregation services (product-page, cart-summary, order-details) |

### Terraform Module Map

| Module | Resource | Purpose |
|--------|----------|---------|
| `vpc` | VPC, subnets, NAT, IGW, flow logs | Network foundation |
| `alb` | ALB, target groups, ACM cert | Load balancing + TLS |
| `ecs_cluster` | ECS cluster, FARGATE + FARGATE_SPOT | Container orchestration |
| `microservice_base` | ECS service, task def, SG | Per-service deployment |
| `rds` | Aurora Serverless v2 | PostgreSQL databases |
| `elasticache` | Redis cluster (r7g.large) | Caching + sessions |
| `msk` | Managed Kafka (m5.large) | Event streaming |
| `opensearch` | OpenSearch domain (m5.large) | Full-text search |
| `observability` | CloudWatch alarms, SNS | Monitoring + alerting |
| `secrets` | Secrets Manager | Secret storage |
| `iam` | IAM roles/policies | Access management |
