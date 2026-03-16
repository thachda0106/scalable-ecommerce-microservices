# Product Service Architecture

## Overview
The product-service manages the product catalog for the ecommerce platform. It handles product creation, updates, status management, deletion, and provides paginated queries with filtering and sorting.

## Layered Architecture (DDD + Clean Architecture)

```mermaid
graph TB
    subgraph Interface["Interface Layer"]
        Controller["ProductController"]
        DTO["DTOs + Validation"]
        Filter["DomainExceptionFilter"]
    end
    subgraph Application["Application Layer"]
        Handlers["Command & Query Handlers"]
        Commands["Commands & Queries"]
        Ports["Application Ports"]
    end
    subgraph Domain["Domain Layer (No Framework Dependencies)"]
        Aggregate["Product Aggregate"]
        VOs["Value Objects"]
        Events["Domain Events"]
        DomainPorts["Repository Ports"]
        Errors["Domain Errors"]
    end
    subgraph Infrastructure["Infrastructure Layer"]
        TypeORM["TypeORM Repository"]
        Kafka["Kafka Event Publisher"]
        Redis["Redis Cache"]
        Metrics["Prometheus Metrics"]
    end
    Controller --> Handlers
    Handlers --> Domain
    Handlers --> Ports
    Infrastructure --> DomainPorts
    Infrastructure --> Ports
```

## Domain Model

### Product Aggregate
- **ProductId** — UUID value object
- **Money** — Amount in cents + currency (avoids floating-point issues)
- **ProductStatus** — State machine with valid transitions

### Status State Machine

```mermaid
stateDiagram-v2
    [*] --> ACTIVE: create()
    ACTIVE --> INACTIVE: deactivate()
    ACTIVE --> OUT_OF_STOCK: markOutOfStock()
    ACTIVE --> ARCHIVED: archive()
    INACTIVE --> ACTIVE: activate()
    INACTIVE --> ARCHIVED: archive()
    OUT_OF_STOCK --> ACTIVE: restock()
    OUT_OF_STOCK --> ARCHIVED: archive()
    ARCHIVED --> [*]
```

## Caching Strategy
- **Pattern**: Cache-aside (lazy loading)
- **Scope**: Individual product lookups only (NOT paginated queries)
- **TTL**: 1 hour (3600 seconds)
- **Degradation**: Graceful — Redis failures never fail requests, falls through to PostgreSQL
- **Invalidation**: On every write operation (update, delete, status change)

## Technology Stack
| Component | Technology |
|-----------|-----------|
| Framework | NestJS |
| Language | TypeScript |
| Database | PostgreSQL |
| Cache | Redis (ioredis) |
| Messaging | Apache Kafka (kafkajs) |
| ORM | TypeORM |
| Metrics | Prometheus (prom-client) |
