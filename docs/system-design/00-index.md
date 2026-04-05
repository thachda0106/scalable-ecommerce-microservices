# System Design Documentation — Amazon-Scale E-Commerce Platform

> **Classification**: Internal Engineering Documentation
> **Audience**: Staff/Principal Engineers, Architecture Review Board, SRE Teams
> **Last Updated**: 2026-04-05
> **Platform**: Scalable Microservices E-Commerce (50M products, 3,000 TPS orders)

---

## Document Index

This documentation comprehensively covers the technical system design of the distributed e-commerce platform. It is organized into five parts spanning fifteen sections.

### Part I — Domain & Architecture ([01-domain-and-architecture.md](./01-domain-and-architecture.md))

| # | Section | Description |
|---|---------|-------------|
| 1 | Business Domain & Domain-Driven Design | Bounded contexts, aggregates, entities, domain events, lifecycles |
| 2 | System Overview & Architecture | Service catalog, tech stack, infrastructure, communication patterns |
| 3 | API Design Strategy | REST conventions, versioning, pagination, idempotency, error handling |

### Part II — Auth & Request Flow ([02-auth-and-request-flow.md](./02-auth-and-request-flow.md))

| # | Section | Description |
|---|---------|-------------|
| 4 | Auth Flow (Authentication & Authorization) | Login, JWT, token lifecycle, RBAC, service-to-service auth |
| 5 | Request Flow (Request Lifecycle) | End-to-end request path, middleware, correlation ID, timeouts |

### Part III — Data, Cache & Events ([03-data-cache-events.md](./03-data-cache-events.md))

| # | Section | Description |
|---|---------|-------------|
| 6 | Data Flow & Database Design | Database-per-service, transactions, consistency, indexing, sharding |
| 7 | Cache Flow (Redis Strategy) | Cache-aside, invalidation, TTL, stampede prevention |
| 8 | Event Flow (Message Queue / Event Bus) | Kafka, outbox/inbox, saga, DLQ, idempotency, event schema |

### Part IV — Jobs, Observability & Deployment ([04-jobs-observability-deployment.md](./04-jobs-observability-deployment.md))

| # | Section | Description |
|---|---------|-------------|
| 9  | Job Flow (Background Workers) | Outbox/inbox processors, scheduled jobs, retry, monitoring |
| 10 | Observability (Logging, Tracing, Monitoring) | OpenTelemetry, Pino, Prometheus, Grafana, alerting |
| 11 | Deployment Flow (CI/CD & Infrastructure) | GitHub Actions, Docker, ECS Fargate, Terraform, rollback |

### Part V — Scale, Security & Reliability ([05-scale-security-reliability.md](./05-scale-security-reliability.md))

| # | Section | Description |
|---|---------|-------------|
| 12 | Scalability Strategy | Horizontal scaling, database scaling, CQRS, multi-region |
| 13 | Security Architecture | TLS, WAF, DDoS, secrets, encryption, OWASP |
| 14 | Failure Scenarios & Reliability | Circuit breaker, retry, backpressure, disaster recovery |
| 15 | Cost Optimization | Compute, storage, cache, network cost strategies |

---

## Architecture Decision Records (Summary)

| ADR | Decision | Rationale |
|-----|----------|-----------|
| ADR-001 | Monorepo (pnpm workspaces) | Shared types, atomic refactors, unified CI |
| ADR-002 | NestJS for all services | TypeScript-native DI, CQRS built-in, decorator patterns |
| ADR-003 | Database-per-service | Full autonomy, independent scaling, no shared schema coupling |
| ADR-004 | Apache Kafka as event backbone | Durable log, replay, consumer groups, partitioned ordering |
| ADR-005 | Transactional outbox + inbox | Guaranteed delivery without 2PC, exactly-once processing |
| ADR-006 | Orchestrated saga (not choreography) | Centralized control flow, easier debugging, explicit compensation |
| ADR-007 | CQRS with physical read model | OpenSearch for search, PostgreSQL for writes — independent scaling |
| ADR-008 | Redis for ephemeral state | Sub-millisecond latency for sessions, rate limits, token store |
| ADR-009 | ECS Fargate (not EKS) | No cluster management overhead, simpler ops, per-task billing |
| ADR-010 | Terraform IaC | Declarative, version-controlled, environment parity |

---

## Quick Reference

```
Tech Stack:         NestJS 11 / TypeScript 5 / Node.js 24
Databases:          PostgreSQL 15 (per-service) via TypeORM
Cache:              Redis 7 (ElastiCache)
Search:             OpenSearch 2.x
Event Broker:       Apache Kafka (Amazon MSK) via KafkaJS
Object Storage:     AWS S3
Container Runtime:  ECS Fargate
IaC:                Terraform
Observability:      OpenTelemetry + Pino + Prometheus + Grafana
Security:           Argon2id + JWT + Helmet + AWS WAF
Validation:         Zod (events) + class-validator (DTOs)
```
