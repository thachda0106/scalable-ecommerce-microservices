---
phase: 19
plan: 3
wave: 2
depends_on: [1, 2]
files_modified:
  - apps/user-service/src/infrastructure/persistence/entities/user.orm-entity.ts
  - apps/user-service/src/infrastructure/persistence/entities/user-profile.orm-entity.ts
  - apps/user-service/src/infrastructure/persistence/entities/user-settings.orm-entity.ts
  - apps/user-service/src/infrastructure/persistence/entities/outbox-event.orm-entity.ts
  - apps/user-service/src/infrastructure/persistence/mappers/user.mapper.ts
  - apps/user-service/src/infrastructure/persistence/repositories/typeorm-user.repository.ts
  - apps/user-service/src/infrastructure/kafka/kafka-client.factory.ts
  - apps/user-service/src/infrastructure/kafka/kafka-event-publisher.ts
  - apps/user-service/src/infrastructure/kafka/outbox-relay.service.ts
  - apps/user-service/src/infrastructure/config/database.config.ts
autonomous: true
user_setup: []

must_haves:
  truths:
    - "ORM entities never leak into domain layer — mapper converts between them"
    - "Event publishing uses Transactional Outbox pattern (not direct Kafka)"
    - "Repository implements IUserRepository port from domain"
    - "Outbox relay polls and publishes to user.events topic"
  artifacts:
    - "apps/user-service/src/infrastructure/persistence/ contains ORM entities, mapper, repository"
    - "apps/user-service/src/infrastructure/kafka/ contains event publisher, outbox relay, client factory"
---

# Plan 19.3: Infrastructure Layer — Persistence, Kafka Outbox & Configuration

## Objective
Create the infrastructure layer with TypeORM persistence, Transactional Outbox event publishing, and Kafka client.
This plan bridges the domain to the external world while keeping the domain clean.

Purpose: Implement concrete adapters for the repository and event publisher ports.
Output: ORM entities, mapper, repository, Kafka event publisher (outbox pattern), outbox relay, config.

## Context
- .gsd/phases/19/RESEARCH.md (outbox pattern, persistence patterns)
- apps/user-service/src/domain/ (ports and entities from Plan 19.1)
- apps/order-service/src/infrastructure/persistence/ (reference ORM entity + mapper pattern)
- apps/order-service/src/infrastructure/kafka/ (reference outbox pattern)

## Tasks

<task type="auto">
  <name>Create ORM Entities, Mapper, and Repository</name>
  <files>
    apps/user-service/src/infrastructure/persistence/entities/user.orm-entity.ts
    apps/user-service/src/infrastructure/persistence/entities/user-profile.orm-entity.ts
    apps/user-service/src/infrastructure/persistence/entities/user-settings.orm-entity.ts
    apps/user-service/src/infrastructure/persistence/entities/outbox-event.orm-entity.ts
    apps/user-service/src/infrastructure/persistence/mappers/user.mapper.ts
    apps/user-service/src/infrastructure/persistence/repositories/typeorm-user.repository.ts
  </files>
  <action>
    **UserOrmEntity** (follow OrderOrmEntity pattern):
    - @Entity('users')
    - Columns: id (PK UUID), email (varchar, unique), username (varchar, unique), status (varchar), version (int, default 1), createdAt, updatedAt
    - @OneToOne relations to UserProfileOrmEntity and UserSettingsOrmEntity

    **UserProfileOrmEntity**:
    - @Entity('user_profiles')
    - Columns: userId (PK, FK to users), displayName (varchar, nullable), avatar (varchar, nullable), bio (text, nullable), phoneNumber (varchar, nullable), dateOfBirth (date, nullable), updatedAt

    **UserSettingsOrmEntity**:
    - @Entity('user_settings')
    - Columns: userId (PK, FK to users), emailNotifications (boolean, default true), pushNotifications (boolean, default true), smsNotifications (boolean, default false), language (varchar, default 'en'), timezone (varchar, default 'UTC'), updatedAt

    **OutboxEventOrmEntity** (identical to order-service):
    - @Entity('outbox_events')
    - Columns: id (PK UUID), type (varchar), payload (jsonb), processed (boolean, default false), createdAt

    **UserMapper** — static class with toDomain() and toPersistence():
    - `toDomain(orm: UserOrmEntity): User` — creates value objects from primitives, calls User.reconstitute()
    - `toPersistence(domain: User): UserOrmEntity` — extracts primitives from VOs
    - Handles UserProfile and UserSettings mapping as well

    **TypeOrmUserRepository** — implements IUserRepository:
    - @Injectable() with @InjectRepository(UserOrmEntity)
    - Each method converts domain ↔ ORM via UserMapper
    - `save()`: maps to persistence, uses repo.save(), handles profile and settings in same transaction
    - `findById()`: eager-loads profile + settings relations
    - `findByEmail()`, `findByUsername()`: query by column
    - `findAll()`: pagination with skip/take, optional status filter, returns { users, total }
    - `delete()`: uses repo.delete() (hard delete if needed, but domain already uses soft-delete via status)

    AVOID: Leaking TypeORM Repository<> generic type to domain layer.
    AVOID: Using query builder when simple find works — keep queries simple.
    AVOID: Not eager-loading profile/settings — always include relations.
  </action>
  <verify>npx tsc --noEmit --project apps/user-service/tsconfig.json 2>&1 | head -20</verify>
  <done>4 ORM entities, 1 mapper, 1 repository implementation created. UserMapper converts bidirectionally between domain and ORM.</done>
</task>

<task type="auto">
  <name>Create Kafka Event Publisher (Outbox), Outbox Relay, and Config</name>
  <files>
    apps/user-service/src/infrastructure/kafka/kafka-client.factory.ts
    apps/user-service/src/infrastructure/kafka/kafka-event-publisher.ts
    apps/user-service/src/infrastructure/kafka/outbox-relay.service.ts
    apps/user-service/src/infrastructure/config/database.config.ts
  </files>
  <action>
    **KafkaClientFactory** (follow order-service pattern):
    - Creates Kafka client with configurable brokers (from env `KAFKA_BROKERS`)
    - Lazy-initializes producer on first use
    - Methods: `getProducer()`, `onModuleDestroy()` for cleanup

    **KafkaEventPublisher** — implements IEventPublisher:
    - Uses Transactional Outbox — does NOT publish to Kafka directly
    - `publish()` and `publishAll()`: writes events to outbox_events table in a transaction
    - Serializes event to JSON payload
    - Follow order-service KafkaEventPublisher exactly

    **OutboxRelayService**:
    - @Injectable() with @Cron('*/5 * * * * *') — polls every 5 seconds
    - Reads unprocessed outbox events (processed = false)
    - Publishes to Kafka topic `user.events` via KafkaClientFactory producer
    - Marks as processed after successful publish
    - Batch processing: up to 100 events per poll
    - Follow order-service OutboxRelayService pattern

    **DatabaseConfig**:
    - TypeORM config reading from environment variables:
      DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE
    - entities array pointing to ORM entity classes
    - synchronize: false (production safety)

    AVOID: Direct Kafka publishing in KafkaEventPublisher — MUST use outbox table.
    AVOID: Using synchronize: true — it's dangerous for production databases.
  </action>
  <verify>npx tsc --noEmit --project apps/user-service/tsconfig.json 2>&1 | head -20</verify>
  <done>Kafka client factory, outbox event publisher, outbox relay, and DB config created. Events flow: domain → outbox table → relay → Kafka topic.</done>
</task>

## Success Criteria
- [ ] 4 ORM entities with proper TypeORM decorators
- [ ] UserMapper converts bidirectionally between domain and ORM
- [ ] TypeOrmUserRepository implements IUserRepository with pagination
- [ ] KafkaEventPublisher uses Transactional Outbox (not direct Kafka)
- [ ] OutboxRelayService polls and publishes to `user.events` topic
- [ ] Database config reads from environment variables
- [ ] `npx tsc --noEmit` passes
