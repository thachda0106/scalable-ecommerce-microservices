# User Service Architecture

The `user-service` is structured following the principles of Clean Architecture and Domain-Driven Design (DDD). This structure ensures that the core business logic remains framework-agnostic and resilient to changes in external systems.

## Service Modules

### 1. Domain Module (`src/domain/`)
The very core of the service. It contains:
- **Entities**: The core business objects (`User`, `UserProfile`, `UserSettings`) containing business rules and logic. 
- **Value Objects**: Immutable objects that represent descriptive aspects of the domain (e.g., `Email`, `UserId`, `UserStatus`).
- **Domain Events**: Events that denote something significant has happened within the domain.
- **Ports (Interfaces)**: Definitions of the contracts that external layers must implement (e.g., `IUserRepository`).

The Domain module has **zero dependencies** on external frameworks or databases.

### 2. Application Module (`src/application/`)
This module orchestrates the execution of business use cases. It acts upon the domain objects.
- Contains **Commands** and **Queries** (following CQRS principles).
- Contains **Handlers** that execute the specific logic for each use case.
- Uses the ports defined in the Domain module to interact with infrastructure.

### 3. Infrastructure Module (`src/infrastructure/`)
This module provides the concrete implementations of the ports defined in the Domain layer.
- **Persistence**: Implements repositories using databases (e.g., TypeORM with PostgreSQL), defining data mappers and ORM entities.
- **Messaging/Event Bus**: Implements event publishers (e.g., Kafka or Redis implementations) to broadcast domain events to the wider system.
- **Observability**: Implements logging, tracing, and metrics collection.

### 4. Interface/Presentation Module (`src/interfaces/`)
The entry point of the application, responsible for interacting with the outside world.
- **Controllers**: Handle incoming HTTP REST requests.
- **DTOs**: Define the shape and validation rules for incoming request payloads.
- Routes the incoming requests to the appropriate Application use cases.
