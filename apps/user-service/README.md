# User Service

Production-grade identity service managing user accounts, profiles, and settings.

## Tech Stack

- **Runtime**: NestJS (Node.js)
- **Database**: PostgreSQL (TypeORM)
- **Messaging**: Apache Kafka (Transactional Outbox)
- **Metrics**: Prometheus (prom-client)
- **Validation**: class-validator + class-transformer
- **Architecture**: DDD + Clean Architecture

## Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- Apache Kafka (optional, for event publishing)

### Install
```bash
pnpm install
```

### Run
```bash
# Development
pnpm run start:dev

# Production
pnpm run start:prod
```

### Test
```bash
pnpm test
```

## Project Structure

```
src/
├── domain/           # Business rules (zero framework deps)
├── application/      # Use cases (CQRS commands/queries/handlers)
├── infrastructure/   # Database, Kafka, metrics adapters
└── interfaces/       # REST controllers, DTOs, module wiring
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/users` | Create user |
| GET | `/api/users` | List users (paginated) |
| GET | `/api/users/:id` | Get user by ID |
| PATCH | `/api/users/:id` | Update email/username |
| DELETE | `/api/users/:id` | Soft-delete user |
| PATCH | `/api/users/:id/profile` | Update profile |
| PATCH | `/api/users/:id/settings` | Update settings |
| POST | `/api/users/:id/suspend` | Suspend user |
| POST | `/api/users/:id/reactivate` | Reactivate user |

## Environment Variables

See [`.env.example`](.env.example) for all required variables.

## Documentation

- [Architecture](docs/user-service-architecture.md)
- [Events](docs/user-service-events.md)
- [Security](docs/user-service-security.md)
