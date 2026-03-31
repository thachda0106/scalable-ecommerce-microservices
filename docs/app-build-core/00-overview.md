# 🏗️ E-Commerce Microservices — Complete System Design & Implementation Guide

> **From Zero to Production** — A structured, phased approach to designing and building
> a large-scale distributed e-commerce platform, written for Senior → Staff/Principal Engineers.

---

## How to Use This Guide

Each phase builds on the previous one. **Do not skip phases.** The order is intentional — it mirrors how real companies (Amazon, Shopify, Stripe) evolved their platforms.

| Phase | Document | Focus |
|-------|----------|-------|
| 1 | [Requirements & System Design](./phase-01-requirements-and-system-design.md) | What to build, how big, which patterns |
| 2 | [Infrastructure (IaC)](./phase-02-infrastructure-iac.md) | Where it runs, networking, Terraform |
| 3 | [Platform / Core Shared Modules](./phase-03-platform-core-modules.md) | Reusable libraries every service uses |
| 4 | [Microservices Design](./phase-04-microservices-design.md) | Per-service deep dive |
| 5 | [Event-Driven Architecture](./phase-05-event-driven-architecture.md) | Kafka, Sagas, Outbox, DLQ |
| 6 | [CI/CD & Deployment](./phase-06-cicd-and-deployment.md) | Build, ship, deploy, rollback |
| 7 | [Observability](./phase-07-observability.md) | Logs, metrics, traces, alerts |
| 8 | [Production Readiness Checklist](./phase-08-production-readiness.md) | Security, scaling, chaos, runbooks |

---

## Our Reference Architecture

```
                        ┌──────────────┐
                        │  CloudFront  │
                        │    (CDN)     │
                        └──────┬───────┘
                               │
                        ┌──────┴───────┐
                        │   Route 53   │
                        │    (DNS)     │
                        └──────┬───────┘
                               │
                    ┌──────────┴──────────┐
                    │    WAF + ALB        │
                    │  (Rate Limit/DDoS)  │
                    └──────────┬──────────┘
                               │
                    ┌──────────┴──────────┐
                    │    API Gateway      │
                    │  (NestJS :3000)     │
                    └──────────┬──────────┘
                               │
          ┌────────┬───────┬───┴───┬────────┬─────────┐
          ▼        ▼       ▼       ▼        ▼         ▼
       ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
       │ Auth │ │ User │ │ Prod │ │ Cart │ │Order │ │Notif │
       │ Svc  │ │ Svc  │ │ Svc  │ │ Svc  │ │ Svc  │ │ Svc  │
       └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘
          │        │        │        │        │        │
       Redis    Postgres  Postgres  Redis   Postgres    │
                                              │        │
                   ┌──────────────────────────┘        │
                   ▼                                    │
             ┌──────────┐                               │
             │  Kafka   │◄──────────────────────────────┘
             │ (Events) │
             └────┬─────┘
                  │
          ┌───────┴────────┐
          ▼                ▼
     ┌────────┐      ┌─────────┐
     │ Search │      │Inventory│
     │  Svc   │      │  Svc    │
     └───┬────┘      └────┬────┘
         │                 │
     OpenSearch         Postgres
```

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| **Language** | TypeScript (Node.js v24 LTS) |
| **Framework** | NestJS v11 |
| **Monorepo** | pnpm workspaces |
| **Relational DB** | PostgreSQL (TypeORM) |
| **Cache** | Redis (ioredis) |
| **Search** | OpenSearch |
| **Event Broker** | Apache Kafka (kafkajs) |
| **Container** | Docker + ECS Fargate |
| **IaC** | Terraform |
| **CI/CD** | GitHub Actions |
| **CDN** | CloudFront |
| **DNS** | Route 53 |

---

> **Next →** [Phase 1 — Requirements & System Design](./phase-01-requirements-and-system-design.md)
