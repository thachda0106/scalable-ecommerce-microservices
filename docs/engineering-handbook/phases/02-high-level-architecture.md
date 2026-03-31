# Phase 02 — High-Level Architecture

---

## 1. Overview

Translate requirements into an architecture: service boundaries, communication patterns,
data strategy, and deployment model. This is the blueprint everything else builds from.

## 2. Goals

- Define service boundaries and responsibilities
- Choose communication patterns (sync vs async)
- Define data architecture (database per service, CQRS, event sourcing)
- Design the checkout Saga
- Create architecture diagrams

## 3. Architecture Design

See [Architecture Diagrams](../global/architecture-diagrams.md) for full visual reference.

**Core patterns:**
- **Microservices:** 10 independently deployable services
- **API Gateway:** Single entry point for external traffic
- **Event-Driven:** Kafka as async backbone between services
- **CQRS:** Product Service (write) → Kafka → Search Service (read)
- **Saga:** Orchestrated checkout (Order → Inventory → Payment)
- **Outbox/Inbox:** Atomic event publishing + exactly-once consumption
- **Circuit Breaker:** Prevent cascade failures on external calls

## 4. Technology Choices

Deferred to Phase 03 for formal evaluation. This phase focuses on patterns, not tools.

## 5. Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| ADR-004: Orchestrated Saga (not Choreography) | Order Service as orchestrator | Single place to view saga state, easier debugging |
| ADR-005: CQRS for Product Catalog | Separate read (OpenSearch) from write (PostgreSQL) | Full-text search needs search engine |
| ADR-006: JWT (not session) | Stateless tokens with Redis blacklist | No session store, horizontal scaling |
| ADR-007: Row-level multi-tenancy | tenantId column on all tables | Single deployment, simpler infrastructure |

## 6. Data Flow / Request Flow

See [Request Flows](../global/request-flows.md) for detailed diagrams.

**Key flows:**
1. Synchronous: Client → Gateway → Service → DB → response
2. Async: Service → Outbox → Relay → Kafka → Inbox → Consumer
3. Saga: Order → ReserveStock → ProcessPayment → Confirm (compensate on failure)

## 7. Components Involved

| Component | Type | Responsibility |
|-----------|------|---------------|
| API Gateway | Routing | Single entry, auth, rate limiting |
| 9 Backend Services | Business logic | Domain-specific operations |
| PostgreSQL (5 instances) | Persistence | Per-service write store |
| Redis | Cache/Session | Cart, auth tokens, query cache |
| Kafka | Events | Async communication backbone |
| OpenSearch | Search | CQRS read model |
| ALB + CloudFront | Edge | Load balancing, CDN |

## 8. Implementation Plan

| Step | Duration |
|------|----------|
| Draw C4 context + container diagrams | Day 1 |
| Define communication matrix (who calls whom) | Day 1 |
| Design session architecture (JWT + refresh) | Day 2 |
| Design checkout Saga state machine | Day 2 |
| Design CQRS Product → Search sync | Day 3 |
| Review with team | Day 3 |

## 9. Tasks Checklist

```
- [ ] C4 context diagram
- [ ] C4 container diagram (services + infrastructure)
- [ ] Communication matrix (sync HTTP / async Kafka)
- [ ] Saga state machine diagram
- [ ] CQRS data flow diagram
- [ ] Auth architecture (JWT flow)
- [ ] Multi-tenancy strategy
- [ ] Caching strategy
- [ ] ADRs for all key decisions
- [ ] Architecture review meeting
```

## 10. Deliverables

| Deliverable | Format |
|-------------|--------|
| Architecture diagrams (C4) | Mermaid / draw.io |
| Communication matrix | Markdown table |
| Saga state machine | State diagram |
| ADRs (4-5 records) | Markdown |

## 11. Dependencies

| Depends On | Needed For |
|-----------|-----------|
| Phase 01 (Requirements) | Service boundaries, NFRs |

## 12. Risks

| Risk | Mitigation |
|------|-----------|
| Too many services for team size | Start with 5 core, add others later |
| Saga complexity | Implement simple 3-step saga first |
| Distributed data consistency | Outbox/Inbox pattern enforces reliability |

## 13. Common Mistakes

- Creating too many services too early (distributed monolith)
- Not defining saga compensations before building the happy path
- Assuming synchronous communication will scale (it won't)

## 14. Best Practices

- Draw architecture on a whiteboard with the team first
- Define the communication matrix before writing any service code
- For every Saga forward step, define the compensation step immediately
