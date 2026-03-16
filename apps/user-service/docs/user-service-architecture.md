# User Service Architecture

## Overview

The user-service manages user accounts, profiles, and settings within the e-commerce platform. It is distinct from the auth-service which handles authentication credentials (passwords, OAuth, tokens, roles).

**Bounded Context**: User account lifecycle, profile management, notification preferences.

## Layered Architecture

```mermaid
graph TB
    subgraph "Interface Layer"
        A[UserController] --> B[DTOs + ValidationPipe]
        C[HealthController]
        D[MetricsController]
    end

    subgraph "Application Layer"
        E[Command Handlers] --> F[Query Handlers]
        G[Commands/Queries]
        H[IEventPublisher Port]
    end

    subgraph "Domain Layer"
        I[User Aggregate Root]
        J[UserProfile Entity]
        K[UserSettings Entity]
        L[Value Objects]
        M[Domain Events]
        N[IUserRepository Port]
    end

    subgraph "Infrastructure Layer"
        O[TypeOrmUserRepository]
        P[KafkaEventPublisher]
        Q[OutboxRelayService]
        R[UserMetricsService]
        S[AuditLogService]
    end

    A --> E
    A --> F
    E --> N
    E --> H
    O -.implements.-> N
    P -.implements.-> H
```

## Domain Model

```mermaid
classDiagram
    class User {
        -UserId _id
        -Email _email
        -Username _username
        -UserStatus _status
        -UserProfile _profile
        -UserSettings _settings
        -number _version
        +create(props) User
        +reconstitute(props) User
        +updateEmail(email)
        +updateUsername(username)
        +updateProfile(props)
        +updateSettings(props)
        +suspend(reason)
        +reactivate()
        +delete()
        +pullDomainEvents()
    }

    class UserProfile {
        -string displayName
        -string avatar
        -string bio
        -string phoneNumber
        -Date dateOfBirth
    }

    class UserSettings {
        -boolean emailNotifications
        -boolean pushNotifications
        -boolean smsNotifications
        -string language
        -string timezone
    }

    User "1" *-- "1" UserProfile
    User "1" *-- "1" UserSettings
```

## User Status Lifecycle

```mermaid
stateDiagram-v2
    [*] --> ACTIVE : User.create()
    ACTIVE --> SUSPENDED : suspend(reason)
    SUSPENDED --> ACTIVE : reactivate()
    ACTIVE --> DELETED : delete()
    SUSPENDED --> DELETED : delete()
    DELETED --> [*]
```

## Directory Structure

```
src/
├── domain/
│   ├── entities/         # User, UserProfile, UserSettings
│   ├── value-objects/    # UserId, Email, Username, UserStatus
│   ├── events/           # UserCreated, UserUpdated, etc.
│   ├── errors/           # DomainException, InvalidStatusTransition
│   └── ports/            # IUserRepository
├── application/
│   ├── commands/         # CreateUser, UpdateUser, etc.
│   ├── queries/          # GetUserById, GetUsers, etc.
│   ├── handlers/         # 7 command + 4 query handlers
│   └── ports/            # IEventPublisher
├── infrastructure/
│   ├── persistence/      # ORM entities, mapper, repository
│   ├── kafka/            # Event publisher (outbox), relay, client
│   ├── config/           # Database config
│   └── observability/    # Metrics, audit log
└── interfaces/
    ├── controllers/      # UserController, HealthController
    ├── dto/              # 6 validated DTOs
    └── user.module.ts    # NestJS module wiring
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/users` | Create user |
| GET | `/api/users` | List users (paginated) |
| GET | `/api/users/:id` | Get user by ID |
| PATCH | `/api/users/:id` | Update user email/username |
| DELETE | `/api/users/:id` | Soft-delete user |
| PATCH | `/api/users/:id/profile` | Update user profile |
| PATCH | `/api/users/:id/settings` | Update user settings |
| POST | `/api/users/:id/suspend` | Suspend user |
| POST | `/api/users/:id/reactivate` | Reactivate user |
| GET | `/api/health` | Health check |
| GET | `/api/metrics` | Prometheus metrics |

## Key Patterns

- **DDD Aggregate Root**: User entity encapsulates all business rules and status transitions
- **Transactional Outbox**: Domain events saved to outbox table then relayed to Kafka (not direct publishing)
- **Repository Pattern**: `IUserRepository` port with TypeORM implementation, Symbol-based DI
- **CQRS**: Separate command and query handlers with dedicated data classes
- **Audit Logging**: Structured JSON logs for security-critical operations
