# Product Service Architecture

## Module Structure Overview

The Product Service follows a strict Layered Architecture (Domain-Driven Design + Clean Architecture) grouped into cohesive modules to maintain boundaries and ensure high maintainability.

### 1. Domain Layer (`src/domain/`)
The core of the application housing the true business rules.
- **Rules**: Zero dependencies on any external framework (no NestJS, TypeORM, or Kafka imports).
- **Contents**: 
  - `Product` Aggregate Root
  - Value Objects (`ProductId`, `Money`, `ProductStatus`)
  - Domain Events
  - Port definitions (`IProductRepository`)
  - Domain Errors

### 2. Application Layer (`src/application/`)
Orchestrates the domain objects to perform specific use cases.
- **Pattern**: Command Query Responsibility Segregation (CQRS). Commands modify state, Queries read state.
- **Contents**:
  - Commands (`CreateProductCommand`, `UpdateProductCommand`)
  - Queries (`GetProductByIdQuery`, `GetProductsQuery`)
  - Handlers (e.g., `CreateProductHandler`). These handlers inject infrastructure dependencies via interfaces (Ports) and execute domain logic on aggregates.
  - Application Ports (`IEventPublisher`, `IProductCache`)

### 3. Infrastructure Layer (`src/infrastructure/`)
Contains the concrete implementations for all external I/O interactions.
- **Persistence (`persistence/`)**: TypeORM entities (`ProductOrmEntity`), mappers to convert ORM entities to Domain aggregates, and the actual Postgres repository implementation.
- **Messaging (`kafka/`)**: Kafka client factory, the concrete `KafkaEventPublisher`, and the `OutboxRelayService` which polls the outbox table for reliable event dispatch.
- **Caching (`redis/`)**: ioredis implementation for the caching port using the cache-aside pattern.
- **Observability (`observability/`)**: Prometheus metrics integration wrapper.

### 4. Interface Layer (`src/interfaces/`)
The entry point for external interaction driving the application layer.
- **Controllers**: `ProductController` translating HTTP requests. It contains zero business logic, solely passing mapped DTOs into the CQRS handlers.
- **DTOs**: Class-validator enabled Data Transfer Objects defining the HTTP contract.
- **Filters**: Translates DomainExceptions into proper HTTP status codes (e.g., mapping `ProductNotFoundError` to 404).

### Module Wiring (`ProductModule`)
The `ProductModule` ties all layers together by telling the NestJS Dependency Injection container which infrastructure classes implement which domain/application ports using Symbol-based tokens (`PRODUCT_REPOSITORY`, `EVENT_PUBLISHER`, `PRODUCT_CACHE`).
