# DECISIONS.md

## ADR 001: Architecture Methodology
**Date**: 2026-03-08
**Status**: Accepted
**Context**: Need to design a system capable of handling Amazon-scale traffic.
**Decision**: Adopt Microservices, Database-per-service, Kafka Event-Driven Architecture, and Saga patterns for distributed transactions.
**Consequences**: Increased operational complexity, requiring strong CI/CD, IaC, and robust observability from day 1.

## ADR 002: Technology Stack
**Date**: 2026-03-08
**Status**: Accepted
**Decision**: Use NestJS/TypeScript (Backend), PostgreSQL + Redis (Data), OpenSearch (Search), AWS (Cloud), Terraform (IaC).
