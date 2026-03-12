---
phase: 8
plan: 2
wave: 1
---

# Plan 8.2: Infrastructure Integration (DB, Redis, Kafka)

## Objective
Implement the infrastructure details for the Auth Service, connecting it to PostgreSQL (via TypeORM), Redis (for rate limiting and token storage), and setting up Kafka producers for event publishing.

## Context
- docs/auth-service-architecture.md
- docker-compose.yml (running infrastructure)

## Tasks

<task type="auto">
  <name>Setup PostgreSQL Integration via TypeORM</name>
  <files>
    - apps/auth-service/src/infrastructure/database/user.orm-entity.ts
    - apps/auth-service/src/infrastructure/database/database.module.ts
    - apps/auth-service/src/app.module.ts
  </files>
  <action>
    - Install `typeorm`, `@nestjs/typeorm`, and `pg` for the `auth-service`.
    - Create a `UserOrmEntity` that maps the Domain `User` entity to the PostgreSQL table. Include unique constraint on email.
    - Create a `DatabaseModule` exporting the TypeOrm connection configured via environment variables (defaulting to the local docker-compose postgres).
    - Provide a repository implementation that maps between TypeORM entities and Domain entities.
    - Import `DatabaseModule` into `AppModule`.
  </action>
  <verify>npm run build --prefix apps/auth-service</verify>
  <done>TypeORM is configured and can synchronize the user table with the DB.</done>
</task>

<task type="auto">
  <name>Setup Redis & Kafka Connections</name>
  <files>
    - apps/auth-service/package.json
    - apps/auth-service/src/infrastructure/redis/redis.module.ts
    - apps/auth-service/src/infrastructure/kafka/kafka-producer.module.ts
  </files>
  <action>
    - Install `ioredis` for Redis and `@nestjs/microservices` (or use existing shared `@ecommerce/events`) for Kafka.
    - Create `RedisModule` that exports an `ioredis` client configured via `process.env.REDIS_HOST`.
    - Create `KafkaProducerModule` that registers a ClientProxy for the shared Kafka broker.
    - Import both modules into `AppModule`.
  </action>
  <verify>npm run build --prefix apps/auth-service</verify>
  <done>NestJS modules for Redis and Kafka are created and build successfully.</done>
</task>

## Success Criteria
- [ ] `typeorm` and `pg` dependencies are installed and database connection is configured.
- [ ] Redis client connection is established using `ioredis`.
- [ ] Kafka client producer module is available for dependency injection.
