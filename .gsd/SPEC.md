# SPEC.md — Ecommerce Platform Specification

> **Status**: `FINALIZED`

## Vision
To build a production-grade, large-scale ecommerce system demonstrating advanced backend engineering concepts similar to Amazon, Shopify, or Alibaba, utilizing modern microservices, event-driven architecture, and Domain-Driven Design on AWS.

## Goals
1. Support 10 million registered users, 100k daily active users, and 50k concurrent users.
2. Ensure low latency: product search < 200ms, checkout < 500ms.
3. Guarantee high availability (99.99%), zero order loss, and no inventory overselling.
4. Implement a robust event-driven architecture using Apache Kafka with CQRS, Event Sourcing, and the Saga pattern.
5. Provide full observability and automated deployments (Infrastructure as Code via Terraform).

## Non-Goals (Out of Scope)
- Client/Frontend implementation (focus is exclusively on backend, infrastructure, and distributed systems engineering).
- Monolithic architecture implementation or generic simplified CRUD approaches.

## Users
- High volume shoppers (target peak of 3k orders/second).
- General users browsing and searching the 50 million product catalog (target peak of 10k searches/second).

## Constraints
- **Stack**: NestJS, TypeScript, PostgreSQL (database per service), Redis, OpenSearch.
- **Messaging**: Apache Kafka for all asynchronous inter-service communication.
- **Infrastructure**: AWS Cloud, orchestrated via Terraform.
- **Microservices**: Loose coupling, eventual consistency, minimal public APIs.

## Success Criteria
- [ ] Services completely isolated with dedicated databases.
- [ ] Asynchronous flows strictly modeled around Kafka events.
- [ ] Edge cases in distributed systems (idempotency, dead letters, race conditions, consistency delays) natively handled.
- [ ] Infrastructure provisioned reliably using modular Terraform.
