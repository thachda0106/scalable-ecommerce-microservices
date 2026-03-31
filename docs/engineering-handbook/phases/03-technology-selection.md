# Phase 03 — Technology Selection

---

## 1. Overview

Formalize every tool and framework choice with evaluation criteria, alternatives considered,
and decision rationale. This phase produces ADRs for every technology decision.

## 2. Goals

- Evaluate and select technologies for all layers (language, framework, DB, cache, messaging, IaC, CI/CD, observability)
- Document why each technology was chosen over alternatives
- Verify team proficiency and training needs
- Create a technology radar (adopt, trial, assess, hold)

## 3. Architecture Design

Not applicable — this phase selects the tools that implement Phase 02's architecture.

## 4. Technology Choices

### Backend

| Category | Choice | Alternatives Considered | Why Chosen |
|----------|--------|------------------------|-----------|
| Language | TypeScript (Node.js 24) | Go, Java (Spring Boot), Kotlin | Team expertise, full-stack reuse, NestJS ecosystem |
| Framework | NestJS v11 | Express, Fastify, Hono | Modular DI, enterprise patterns, decorator-based |
| ORM | TypeORM | Prisma, MikroORM, Drizzle | NestJS integration, migrations, active-record + data-mapper |
| Validation | class-validator | Zod, Joi | NestJS-native decorators |
| API Docs | @nestjs/swagger | — | Automatic OpenAPI from decorators |

### Data

| Category | Choice | Alternatives | Why |
|----------|--------|-------------|-----|
| RDBMS | PostgreSQL 16 | MySQL, CockroachDB | ACID, JSON support, mature, RDS managed |
| Cache | Redis 7 | Memcached | Data structures (Hash for Cart), pub/sub |
| Search | OpenSearch 2.11 | Elasticsearch, Algolia | Managed (AWS), ES-compatible, no licensing issues |
| Message Broker | Kafka (MSK) | SQS, RabbitMQ, EventBridge | Ordered, durable, replayable, multi-consumer |
| Schema | JSON Schema (in-code) | Avro, Protobuf | Simple, TypeScript-native, no registry needed |

### Infrastructure

| Category | Choice | Alternatives | Why |
|----------|--------|-------------|-----|
| Compute | ECS Fargate | EKS, Lambda, EC2 | Serverless containers, no cluster mgmt |
| IaC | Terraform 1.6+ | Pulumi, CDK, CloudFormation | Cloud-agnostic, module ecosystem, HCL readable |
| Container | Docker + multi-stage | — | Industry standard, reproducible builds |
| Registry | ECR | Docker Hub, GHCR | Native ECS integration |
| CI/CD | GitHub Actions | Jenkins, CircleCI | Native repo integration, generous free tier |

### Observability

| Category | Choice | Alternatives | Why |
|----------|--------|-------------|-----|
| Logging | JSON stdout → CloudWatch | ELK, Datadog | Native ECS integration, zero agent |
| Metrics | Prometheus + Grafana | Datadog, CloudWatch Metrics | Industry standard, cost-effective |
| Tracing | OpenTelemetry → Jaeger | X-Ray SDK, Datadog APM | Vendor-neutral, auto-instrumentation |
| Errors | Sentry | Bugsnag, Rollbar | Best grouping/alerting, free tier |

## 5. Key Design Decisions

| ADR | Decision | Impact |
|-----|----------|--------|
| ADR-008 | NestJS over Express | Higher learning curve, faster feature delivery |
| ADR-009 | TypeORM over Prisma | More flexible query building, migration support |
| ADR-010 | Kafka over SQS | Replay capability, ordered processing, multi-consumer |
| ADR-011 | ECS over EKS | Faster setup, lower operational burden |
| ADR-012 | OpenTelemetry over X-Ray SDK | Vendor-neutral, portable to any backend |

## 6. Data Flow / Request Flow

Not applicable — this phase is about selection, not data flow.

## 7. Components Involved

This phase affects all components — every service and infrastructure piece.

## 8. Implementation Plan

| Step | Duration |
|------|----------|
| Evaluate language + framework options | Day 1 |
| Evaluate database + cache options | Day 1 |
| Evaluate messaging + event options | Day 2 |
| Evaluate infrastructure + deployment options | Day 2 |
| Evaluate observability stack | Day 3 |
| Write ADRs for all decisions | Day 3-4 |
| Team review and feedback | Day 4 |
| Finalize technology radar | Day 5 |

## 9. Tasks Checklist

```
- [ ] Evaluate 3+ framework options with pros/cons matrix
- [ ] Evaluate database options per service requirement
- [ ] Evaluate message broker options (ordering, replay, throughput)
- [ ] Evaluate compute platform (serverless vs containers vs VMs)
- [ ] ADR: Backend language + framework
- [ ] ADR: Database choices
- [ ] ADR: Message broker
- [ ] ADR: Compute platform
- [ ] ADR: Observability stack
- [ ] Technology radar document (adopt/trial/assess/hold)
- [ ] Team training plan for new technologies
```

## 10. Deliverables

| Deliverable | Format |
|-------------|--------|
| Technology evaluation matrix (per category) | Markdown table |
| ADRs for all decisions | Markdown files in docs/adrs/ |
| Technology radar | Markdown with categories |
| Training plan | Jira epic or markdown |

## 11. Dependencies

| Depends On | Needed For |
|-----------|-----------|
| Phase 01 (Requirements) | NFRs constrain technology choices |
| Phase 02 (Architecture) | Patterns determine tool categories |

## 12. Risks

| Risk | Mitigation |
|------|-----------|
| Team unfamiliar with chosen tech | Training budget + POC sprints |
| Lock-in to specific vendor | Prefer open standards (OCI, OTLP, SQL) |
| Technology becomes unsupported | Only select actively maintained tools |

## 13. Common Mistakes

- Choosing technology because it's trending, not because it fits requirements
- Not evaluating total cost of ownership (managed vs self-hosted)
- Ignoring team expertise in technology selection
- Not documenting why alternatives were rejected

## 14. Best Practices

- Every technology choice gets an ADR (even if "obvious")
- Evaluate at least 2 alternatives for critical decisions
- Prototype before committing (build a small POC)
- Prefer boring, proven technology over cutting-edge for production systems
