# Phase 1 — Requirements & System Design: Implementation Roadmap

---

## GOALS

Define **what** the system does, **how big** it needs to be, and **which architectural patterns**
it will use. This phase produces the blueprints that every subsequent phase builds on. Skip this
and you'll build the wrong services, with the wrong boundaries, backed by the wrong databases.

**Outcome:** A signed-off Architecture Decision Record (ADR) document that the entire team
references for the next 12+ months.

---

## TECHNOLOGY CHOICES

| Category | Choice | Why |
|----------|--------|-----|
| **Diagramming** | Excalidraw, Mermaid, draw.io | Collaborative, version-controllable |
| **Documentation** | Markdown in Git (ADRs) | Version-controlled, code-reviewed like code |
| **Event Storming** | Miro / FigJam | Remote-friendly, sticky-note simulation |
| **API Spec** | OpenAPI 3.1 (YAML) | Industry standard, generates client SDKs |
| **Domain Modeling** | TypeScript interfaces | Team already knows TS, enforced at compile time |
| **Traffic Modeling** | Spreadsheet + k6 baseline | Quick estimates, validate with real load later |
| **Decision Framework** | ADR format (MADR) | Structured, keeps historical "why" decisions |

### Why These Choices?

- **Markdown ADRs over Confluence:** Living docs in the same repo as code. PRs review architecture
  changes the same way they review code changes. Confluence pages rot because nobody updates them.
- **OpenAPI over Postman collections:** OpenAPI is machine-readable — generates types, mocks, and
  client SDKs. Postman is good for manual testing but bad as a source of truth.
- **Event Storming over whiteboard sessions:** Event Storming systematically reveals bounded
  contexts, domain events, and aggregates. Random whiteboard sessions produce pretty pictures
  that miss critical interactions.

---

## ARCHITECTURE DECISIONS

### ADR-001: Monorepo with pnpm workspaces

```
Status: Accepted
Context: Team of < 20 engineers building 10 services with 3 shared packages
Decision: Single git repo with pnpm workspaces
Rationale:
  - Atomic changes across core + services in one PR
  - Simplified CI (no cross-repo dependency management)
  - Shared tooling (ESLint, TypeScript, testing configs)
Trade-offs:
  - CI must detect changed services (not rebuild everything)
  - Need CODEOWNERS for team boundaries
Alternatives considered:
  - Polyrepo: Better isolation but painful for < 20 engineers
  - Nx monorepo: More tooling overhead for our use case
```

### ADR-002: Database-per-service with PostgreSQL default

```
Status: Accepted
Context: 10 microservices each owning distinct domain data
Decision: Each service owns a dedicated PostgreSQL database instance
  Exception: Cart uses Redis, Search uses OpenSearch
Rationale:
  - Complete data isolation between services
  - Independent schema evolution (no cross-service migrations)
  - Technology freedom per service (Postgres, Redis, OpenSearch)
Trade-offs:
  - No cross-service JOINs (use events for data replication)
  - Eventual consistency between services
```

### ADR-003: Orchestrated Saga for checkout, Choreography for everything else

```
Status: Accepted
Context: Checkout involves 3 services (Order, Inventory, Payment) with compensation
Decision:
  - Orchestrated Saga for checkout flow (Order Service is orchestrator)
  - Choreography (pub/sub) for all other cross-service communication
Rationale:
  - Checkout requires centralized failure handling and compensation
  - Simple flows (product→search sync) don't need an orchestrator
Trade-offs:
  - Order Service becomes more complex
  - Must maintain saga state machine
```

### ADR-004: CQRS for Product Catalog / Search

```
Status: Accepted
Context: Product reads (search, browse) are 100x more frequent than writes
Decision: Separate write model (PostgreSQL) from read model (OpenSearch)
  synchronized via Kafka events
Rationale:
  - PostgreSQL can't do full-text search, faceted queries efficiently
  - OpenSearch optimized for read patterns
  - Eventual consistency acceptable (seconds delay)
```

### ADR-005: JWT with short-lived access tokens + Redis blacklist

```
Status: Accepted
Context: Need stateless auth that works across all services
Decision:
  - Access token: 15 min, signed with RS256
  - Refresh token: 7 days, stored server-side
  - Blacklist: Redis SET with TTL matching token expiry
Rationale:
  - Short-lived tokens reduce damage window if compromised
  - RS256 (asymmetric) allows services to verify without shared secret
  - Redis blacklist enables immediate logout/revocation
```

---

## IMPLEMENTATION STEPS

### Order of Work

```
Step 1: Functional Requirements     [Day 1-2]
  └─► What does the business need?

Step 2: Non-Functional Requirements  [Day 2-3]
  └─► How fast? How reliable? How secure?

Step 3: Traffic Estimation           [Day 3]
  └─► How big are we building for?

Step 4: Event Storming               [Day 4-5]
  └─► What events happen? What are the domains?

Step 5: Bounded Contexts / Services  [Day 5-6]
  └─► Where are the service boundaries?

Step 6: Data Model (per service)     [Day 6-8]
  └─► What tables? What relationships?

Step 7: API Design (OpenAPI)         [Day 8-10]
  └─► What endpoints? What DTOs?

Step 8: Event Catalog                [Day 10-11]
  └─► What events? What schemas? What topics?

Step 9: Architecture Diagrams        [Day 11-12]
  └─► High-level, deployment, sequence diagrams

Step 10: ADR Review & Sign-off      [Day 12-14]
  └─► Team reviews, stakeholders approve
```

---

## TASK BREAKDOWN

```
Phase 1 — Requirements & System Design
├── [ ] 1.1 — Functional Requirements
│   ├── [ ] List all user stories with acceptance criteria
│   ├── [ ] Categorize as MVP / V1.1 / V2
│   ├── [ ] Identify admin vs customer vs seller flows
│   └── [ ] Review with product owner
│
├── [ ] 1.2 — Non-Functional Requirements
│   ├── [ ] Define availability target (99.95%)
│   ├── [ ] Define latency targets (p50, p95, p99)
│   ├── [ ] Define throughput targets (orders/sec peak)
│   ├── [ ] Define data retention policies
│   ├── [ ] Define security requirements (PCI, GDPR)
│   └── [ ] Define SLOs for each service
│
├── [ ] 1.3 — Traffic Estimation
│   ├── [ ] Estimate DAU, RPS per endpoint
│   ├── [ ] Estimate storage growth per year
│   ├── [ ] Estimate peak multiplier (10x for flash sales)
│   └── [ ] Document in a shared spreadsheet
│
├── [ ] 1.4 — Domain Modeling (Event Storming)
│   ├── [ ] Conduct event storming session (2-4 hours)
│   ├── [ ] Identify domain events (orange stickies)
│   ├── [ ] Identify commands (blue stickies)
│   ├── [ ] Identify aggregates (yellow stickies)
│   ├── [ ] Group into bounded contexts
│   └── [ ] Map context relationships (upstream/downstream)
│
├── [ ] 1.5 — Service Boundary Definition
│   ├── [ ] Define each service's responsibility
│   ├── [ ] Define what each service does NOT own
│   ├── [ ] Map service → database → technology
│   ├── [ ] Define service communication patterns
│   └── [ ] Document autonomy rules (no shared DBs)
│
├── [ ] 1.6 — Data Model Design
│   ├── [ ] Design schema for User Service (PostgreSQL)
│   ├── [ ] Design schema for Product Service (PostgreSQL)
│   ├── [ ] Design schema for Order Service (PostgreSQL)
│   ├── [ ] Design schema for Inventory Service (PostgreSQL)
│   ├── [ ] Design schema for Payment Service (PostgreSQL)
│   ├── [ ] Design data model for Cart Service (Redis)
│   ├── [ ] Design index mapping for Search Service (OpenSearch)
│   ├── [ ] Design outbox table schema (shared)
│   └── [ ] Design inbox table schema (shared)
│
├── [ ] 1.7 — API Design
│   ├── [ ] Write OpenAPI spec for each service
│   ├── [ ] Define request/response DTOs
│   ├── [ ] Define error response format
│   ├── [ ] Define pagination format
│   ├── [ ] Define auth header requirements
│   └── [ ] Peer review all API specs
│
├── [ ] 1.8 — Event Catalog
│   ├── [ ] Define event envelope schema
│   ├── [ ] Define all domain events per service
│   ├── [ ] Define Kafka topic naming convention
│   ├── [ ] Define consumer group naming convention
│   ├── [ ] Define event versioning strategy
│   └── [ ] Document event flow diagrams
│
├── [ ] 1.9 — Architecture Diagrams
│   ├── [ ] High-level system architecture
│   ├── [ ] Network/deployment architecture (VPC, subnets)
│   ├── [ ] Checkout saga sequence diagram
│   ├── [ ] CQRS product → search data flow
│   ├── [ ] Auth flow (login → JWT → API call)
│   └── [ ] Event flow (publish → Kafka → consume)
│
└── [ ] 1.10 — ADR Documentation & Review
    ├── [ ] Write ADR for each major decision
    ├── [ ] Create decision log (ADR index)
    ├── [ ] Team review session
    ├── [ ] Stakeholder sign-off
    └── [ ] Commit all documents to /docs
```

---

## FOLDER STRUCTURE

```
docs/
├── adrs/                           # Architecture Decision Records
│   ├── 001-monorepo-strategy.md
│   ├── 002-database-per-service.md
│   ├── 003-saga-pattern-checkout.md
│   ├── 004-cqrs-product-search.md
│   ├── 005-jwt-auth-strategy.md
│   ├── 006-event-driven-kafka.md
│   └── README.md                   # ADR index
│
├── api-specs/                      # OpenAPI specifications
│   ├── auth-service.yaml
│   ├── user-service.yaml
│   ├── product-service.yaml
│   ├── search-service.yaml
│   ├── cart-service.yaml
│   ├── order-service.yaml
│   ├── inventory-service.yaml
│   ├── payment-service.yaml
│   └── notification-service.yaml
│
├── event-catalog/                  # Event schemas
│   ├── envelope.schema.json
│   ├── product-events.md
│   ├── order-events.md
│   ├── inventory-events.md
│   ├── payment-events.md
│   ├── user-events.md
│   └── event-flow-diagrams.md
│
├── data-models/                    # Database schemas
│   ├── user-service.sql
│   ├── product-service.sql
│   ├── order-service.sql
│   ├── inventory-service.sql
│   ├── payment-service.sql
│   └── cart-service-redis.md
│
├── diagrams/                       # Architecture diagrams
│   ├── high-level-architecture.excalidraw
│   ├── network-architecture.excalidraw
│   ├── checkout-saga-sequence.excalidraw
│   └── cqrs-data-flow.excalidraw
│
└── app-build-core/                 # Phase guide docs (already created)
    ├── 00-overview.md
    ├── phase-01-requirements-and-system-design.md
    └── ...
```

---

## EXAMPLE CONFIGS

### ADR Template

```markdown
# ADR-NNN: [Decision Title]

## Status
[Proposed | Accepted | Deprecated | Superseded by ADR-XXX]

## Context
What is the problem we are trying to solve?

## Decision
What did we decide?

## Rationale
Why did we choose this approach?

## Consequences
- Positive: ...
- Negative: ...
- Trade-offs: ...

## Alternatives Considered
1. [Alternative A] — Rejected because...
2. [Alternative B] — Rejected because...
```

### Event Schema (JSON Schema)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "EventEnvelope",
  "type": "object",
  "required": ["eventId", "eventType", "version", "timestamp", "source", "payload"],
  "properties": {
    "eventId": { "type": "string", "format": "uuid" },
    "eventType": { "type": "string", "pattern": "^[a-z]+\\.[a-z-]+$" },
    "version": { "type": "integer", "minimum": 1 },
    "timestamp": { "type": "string", "format": "date-time" },
    "source": { "type": "string" },
    "correlationId": { "type": "string" },
    "tenantId": { "type": "string" },
    "payload": { "type": "object" }
  }
}
```

---

## DEPENDENCIES

```
Phase 1 has NO external dependencies.
It is the starting point — everything else depends on it.

Internal dependencies within Phase 1:
  1.1 Functional Requirements → feeds into 1.4 Event Storming
  1.2 NFRs → feeds into 1.3 Traffic Estimation
  1.4 Event Storming → feeds into 1.5 Service Boundaries
  1.5 Service Boundaries → feeds into 1.6 Data Models
  1.5 Service Boundaries → feeds into 1.7 API Design
  1.5 Service Boundaries → feeds into 1.8 Event Catalog
  1.6 + 1.7 + 1.8 → feeds into 1.9 Architecture Diagrams
  All above → feeds into 1.10 ADR Review
```

---

## DELIVERABLES

| # | Deliverable | Format | Reviewed By |
|---|-------------|--------|-------------|
| D1 | Functional requirements with user stories | Markdown | Product Owner |
| D2 | NFR matrix with SLOs | Markdown table | Engineering Lead |
| D3 | Traffic estimation spreadsheet | Markdown/Spreadsheet | SRE/Platform team |
| D4 | Service boundary map | Diagram + Markdown | All engineers |
| D5 | Data model per service | SQL/Markdown | DB-owning engineers |
| D6 | OpenAPI specs per service | YAML files | Frontend + Backend |
| D7 | Event catalog (all events + schemas) | Markdown + JSON Schema | All engineers |
| D8 | Architecture diagrams (high-level, deployment, sequence) | Excalidraw/PNG | All engineers |
| D9 | ADR documents for all major decisions | Markdown | Tech Lead sign-off |

---

## COMMON MISTAKES

> [!CAUTION]
> **1. Skipping Event Storming.** Engineers jump straight to "let's make a User Service" without
> understanding the business domain. Event Storming with domain experts reveals interactions
> that pure engineering thinking misses.
>
> **2. Designing too many services.** A team of 5 engineers does not need 15 services.
> Start with fewer, larger services and split later when the boundaries become clear.
> The cost of merging is lower than the cost of premature splitting.
>
> **3. Ignoring NFRs until production.** "We'll optimize later" becomes "we need to rewrite"
> when you discover your design can't handle 10x load. NFRs shape architecture — define them first.
>
> **4. No ADRs.** Without documenting WHY decisions were made, new team members question and
> re-litigate every choice. ADRs preserve institutional knowledge.
>
> **5. API design without consumer input.** Backend engineers design APIs that make sense for
> the backend but are painful for the frontend. Review API specs with frontend/mobile engineers.
>
> **6. Not versioning events from day one.** Adding versioning to an existing event system is
> 10x harder than starting with it. Every event gets a version field from the start.

---

> **Next →** [Phase 2 — Infrastructure Implementation](./phase-02-implementation.md)
