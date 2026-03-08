# 🛍️ Amazon-Scale Distributed E-Commerce Platform

A production-ready e-commerce platform built on a modernized microservices architecture designed to handle extremely high loads (e.g., 50M products, 3,000 TPS orders), modeled after massive-scale retail systems.

This project was built from scratch using a phased approach, strictly following microservices best practices, Domain-Driven Design (DDD), Event-Driven Architecture (EDA), and the Saga pattern for distributed transactions.

---

## 🚀 Key Features and Capabilities

*   **Microservices Architecture:** 8 distinct Core Services, completely decoupled, with independent databases (Database-per-Service pattern).
*   **Event-Driven Backbone:** Uses **Apache Kafka** (via AWS MSK assumptions) for asynchronous communication, pub/sub, and eventual consistency between domains.
*   **CQRS Pattern:** Complete physical segregation between the Product Catalog (PostgreSQL, writer) and the Search index (OpenSearch, reader) via Kafka event synchronization.
*   **Distributed Transactions (Saga):** Implements a robust Orchestrated Saga for complex checkout flows across Order, Inventory, and Payment services with full compensation/rollback capabilities to prevent overselling.
*   **Performance Optimization:** Ephemeral distributed state (Shopping Cart) is backed entirely by **Redis** for ultra-low latency response times.
*   **Optimistic Concurrency Control (OCC):** The Inventory system uses localized OCC (via versioning) to ensure atomic stock reservations even under massive concurrent spikes.
*   **Transactional Outbox Pattern:** Services utilize the Outbox pattern with background relay workers to guarantee at-least-once message delivery to Kafka without distributed locking, ensuring ACID consistency for local state changes + event emissions.
*   **CI/CD Ready:** Automated monorepo multi-stage Docker builds and GitHub Actions pipelines configured for containerized ECS Fargate deployments.
*   **Centralized Observability:** Integrated with `@nestjs/terminus` for health, built-in Prometheus metric hooks, JSON standardized logging natively, and OpenTelemetry readiness.

---

## 🏗️ Architecture Overview

The system is deployed as independent NestJS applications inside a `pnpm` workspace monorepo.

*For detailed sequence diagrams, domain boundaries, database schemas, and AWS infrastructure plans, please fully review [ARCHITECTURE.md](.gsd/ARCHITECTURE.md).*

### The Core Microservices

| Service                  | Primary Data Store      | Port | Responsibility                                                                                                 |
|--------------------------|-------------------------|------|----------------------------------------------------------------------------------------------------------------|
| **API Gateway**          | None                    | 3000 | Entry point, routing, rate-limiting, and aggregate APIs.                                                       |
| **Auth Service**         | Redis (Cache)           | 3001 | JWT generation, token validation, RBAC, and session blacklisting.                                              |
| **User Service**         | PostgreSQL              | 3002 | Customer profiles, address books, and user metadata.                                                           |
| **Product Service**      | PostgreSQL              | 3003 | System of record for catalog, pricing, attributes. Publishes `ProductCreated`/`ProductUpdated`.                |
| **Search Service**       | OpenSearch              | 3004 | Consumes product events to build a high-performance, denormalized read model for fast full-text searching.     |
| **Cart Service**         | Redis                   | 3005 | Ephemeral shopping cart state for ultra-fast add/remove operations.                                            |
| **Order Service**        | PostgreSQL              | 3006 | Manages order lifecycles and acts as the **Checkout Saga Orchestrator**.                                       |
| **Inventory Service**    | PostgreSQL              | 3007 | Tracks stock levels. Uses OCC to reserve stock atomically.                                                     |
| **Payment Service**      | PostgreSQL              | 3008 | Integrates with external gateways. Manages localized payment states.                                           |
| **Notification Service** | None                    | 3009 | Consumes outcome events (`OrderConfirmed`, `OrderFailed`) to send emails and SMS (currently mocked).           |

---

## 💻 Tech Stack

*   **Backend Framework:** [NestJS](https://nestjs.com/) (v11) leveraging TypeScript.
*   **Data Tier:**
    *   **PostgreSQL** (via TypeORM) for relational integrity.
    *   **Redis** (via `ioredis`) for caching and ephemeral states.
    *   **OpenSearch** (via `@opensearch-project/opensearch`) for full-text product search.
*   **Event Broker:** **Apache Kafka** (via `kafkajs`).
*   **Package Manager:** **pnpm** (workspaces).

---

## ⚡ Getting Started (Local Development)

### Prerequisites

*   **Node.js** (v24 LTS recommended)
*   **pnpm** (v10+)
*   **Docker** & **Docker Compose**

### 1. Start Dependencies

The platform requires external services (PostgreSQL, Redis, Kafka, ZooKeeper, OpenSearch) to run. A `docker-compose.yml` is provided.

```bash
cd docker
docker-compose up -d
```

*(Ensure all containers are healthy. This may take a few moments for OpenSearch and Kafka to bootstrap).*

### 2. Install Workspace Dependencies

Navigate to the project root and install all monorepo dependencies.

```bash
pnpm install
```

### 3. Build Libraries and Services

The workspace heavily relies on shared libraries (`@ecommerce/core`, `@ecommerce/events`). You should build the entire workspace first.

```bash
pnpm build
```

### 4. Run Services

You can run an individual service natively leveraging the Nest CLI:

```bash
# E.g., Starting the API Gateway in watch mode
cd apps/api-gateway
pnpm start:dev
```

*Note: Since there are many microservices, you will need to open multiple terminal tabs or set up a task runner (like `concurrently` or Turborepo) to run the entire backend suite locally.*

---

## 📝 Roadmap Highlights

This project was executed in strict phases. All MVP phases are complete:
- [x] **Phase 1**: Architecture & System Design
- [x] **Phase 2**: Infrastructure as Code (Terraform)
- [x] **Phase 3**: Foundation Services & API Gateway
- [x] **Phase 4**: Product Catalog & Search (CQRS pattern)
- [x] **Phase 5**: Transactional Core (Saga pattern across Cart, Order, Inventory, Payment)
- [x] **Phase 6**: Notifications & CI/CD Finalization

*View the full execution history in [.gsd/ROADMAP.md](.gsd/ROADMAP.md).*

---

## 🛡️ License

This project is licensed under the MIT License.
