# Phase 01 — Requirements

---

## 1. Overview

Define what the system must do (functional) and how well it must do it (non-functional).
This is the foundation — every architecture decision traces back to a requirement.

## 2. Goals

- Document all user stories and capabilities
- Establish SLOs for latency, availability, and throughput
- Estimate traffic patterns and peak loads
- Define bounded contexts for microservice boundaries
- Get stakeholder sign-off on scope

## 3. Architecture Design

No architecture in this phase — this phase PRODUCES the inputs for architecture design.

**Output artifacts:**
- Functional requirements document
- Non-functional requirements (SLOs, SLAs)
- Traffic estimation model
- User journey maps
- Domain model (bounded contexts)

## 4. Technology Choices

None in this phase. Technology is selected in Phase 03 based on requirements gathered here.

## 5. Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| ADR-001: Monorepo | Single repo, pnpm workspaces | Shared code, atomic commits, unified CI |
| ADR-002: Database per Service | Each service owns its data | Data isolation, independent scaling |
| ADR-003: Async-First Communication | Kafka events over HTTP chains | Loose coupling, fault tolerance |

## 6. Data Flow / Request Flow

Define high-level user journeys:
1. **Browse** → search/filter products → view detail
2. **Purchase** → add to cart → checkout → payment → confirmation
3. **Account** → register → login → profile → orders
4. **Admin** → manage products → manage inventory → view analytics

## 7. Components Involved

Identify 10 services from domain modeling:
- Auth, User (Identity context)
- Product, Search (Catalog context)
- Cart (Shopping context)
- Order, Payment, Inventory (Checkout context)
- Notification (Engagement context)
- API Gateway (Infrastructure)

## 8. Implementation Plan

| Step | Task | Duration |
|------|------|----------|
| 1 | Stakeholder interviews | Day 1 |
| 2 | User story writing workshop | Day 1-2 |
| 3 | Domain modeling (Event Storming) | Day 2-3 |
| 4 | Traffic estimation | Day 3 |
| 5 | NFR definition (SLOs) | Day 4 |
| 6 | Requirements review | Day 5 |

## 9. Tasks Checklist

```
- [ ] Functional requirements (user stories per service)
- [ ] Non-functional requirements (latency, availability, throughput)
- [ ] Traffic estimation (daily users, peak events, storage growth)
- [ ] Event Storming workshop (identify domains, events, commands)
- [ ] Bounded context diagram
- [ ] High-level data model per domain
- [ ] API contract sketches (REST endpoints)
- [ ] Stakeholder sign-off
```

## 10. Deliverables

| Deliverable | Format |
|-------------|--------|
| Functional requirements | Markdown + Jira stories |
| Non-functional requirements (SLOs) | Markdown table |
| Traffic estimation | Spreadsheet/markdown |
| Bounded context diagram | Mermaid/draw.io |
| Event Storming output | Photo/digital board |

## 11. Dependencies

| Phase | Dependency |
|-------|-----------|
| Phase 02 | Requires requirement scope to size infrastructure |
| Phase 03 | Requires NFRs to select appropriate technologies |
| Phase 06 | Requires domain model to define service boundaries |

## 12. Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Scope creep | Timeline slip | Strict MVP scope, defer to v2 |
| Missing NFRs | Wrong infrastructure sizing | Interview ops team + review SLOs |
| Wrong domain boundaries | Coupled services | Event Storming validates boundaries |

## 13. Common Mistakes

- Jumping to code without documenting requirements
- Defining services by technical function, not business domain
- No traffic estimation → running blind on infrastructure sizing
- Skipping NFRs → building a system that can't handle expected load

## 14. Best Practices

- Use Event Storming to discover domain events before defining APIs
- Define SLOs (not SLAs) first — SLAs come from business, SLOs are engineering targets
- Review requirements with 3 stakeholders minimum
- Keep MVP scope to 3-5 core user journeys
