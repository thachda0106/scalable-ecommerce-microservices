---
phase: 20
plan: 1
wave: 1
---

# Plan 20.1: Data Safety — Remove synchronize & Add Migrations

## Objective
Eliminate `synchronize: true` from all TypeORM configs and establish migration-based schema management. This prevents silent schema mutations that can drop columns/tables in non-production environments.

## Context
- .gsd/phases/20/RESEARCH.md (Wave 1 findings)
- apps/order-service/src/app.module.ts
- apps/product-service/src/app.module.ts
- apps/auth-service/src/infrastructure/database/database.module.ts
- apps/payment-service/src/app.module.ts
- apps/inventory-service/src/config/inventory.config.ts
- apps/user-service/src/infrastructure/config/database.config.ts

## Tasks

<task type="auto">
  <name>Set synchronize: false in all services</name>
  <files>
    apps/order-service/src/app.module.ts
    apps/product-service/src/app.module.ts
    apps/auth-service/src/infrastructure/database/database.module.ts
  </files>
  <action>
    In each file, replace the `synchronize` line with `synchronize: false`.

    - order-service: Change `synchronize: process.env.NODE_ENV !== 'production'` → `synchronize: false`
    - product-service: Change `synchronize: process.env.NODE_ENV !== 'production'` → `synchronize: false`
    - auth-service: Change `synchronize: process.env.NODE_ENV !== 'production'` → `synchronize: false`
    - Add a comment: `// Never use synchronize — use TypeORM migrations instead`

    Do NOT touch user-service (already false), inventory-service (default false), or payment-service (env-var controlled, default false).
  </action>
  <verify>grep -rn "synchronize" apps/*/src/ --include="*.ts" | grep -v "node_modules" | grep -v "false"</verify>
  <done>Zero results from grep — no service has synchronize set to anything other than false</done>
</task>

<task type="auto">
  <name>Add TypeORM migration CLI config to each DB-backed service</name>
  <files>
    apps/order-service/typeorm.config.ts (NEW)
    apps/product-service/typeorm.config.ts (NEW)
    apps/auth-service/typeorm.config.ts (NEW)
    apps/user-service/typeorm.config.ts (NEW)
    apps/payment-service/typeorm.config.ts (NEW)
    apps/inventory-service/typeorm.config.ts (NEW)
  </files>
  <action>
    Create a `typeorm.config.ts` (DataSource config for CLI) in each DB-backed service root:

    ```typescript
    import { DataSource } from 'typeorm';
    import * as dotenv from 'dotenv';
    dotenv.config();

    export default new DataSource({
      type: 'postgres',
      url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/<service>_db',
      entities: ['src/**/*.orm-entity.ts'],
      migrations: ['src/infrastructure/persistence/migrations/*.ts'],
      synchronize: false,
    });
    ```

    Add a `migrations/` directory under `src/infrastructure/persistence/` (or equivalent) with a `.gitkeep`.

    Add npm scripts to each service's `package.json`:
    - `"migration:generate": "typeorm migration:generate -d ./typeorm.config.ts"`
    - `"migration:run": "typeorm migration:run -d ./typeorm.config.ts"`
    - `"migration:revert": "typeorm migration:revert -d ./typeorm.config.ts"`

    Do NOT generate initial migrations — that requires a running DB. Just set up the infrastructure.
  </action>
  <verify>find apps/*/typeorm.config.ts -type f | wc -l</verify>
  <done>6 typeorm.config.ts files exist (one per DB-backed service)</done>
</task>

<task type="auto">
  <name>Add @VersionColumn to auth-service user entity</name>
  <files>
    apps/auth-service/src/infrastructure/database/user.orm-entity.ts
  </files>
  <action>
    Add `@VersionColumn()` to the auth-service `user.orm-entity.ts`.

    Import `VersionColumn` from 'typeorm'.
    Add `@VersionColumn() version: number;` field to the entity class.

    This ensures optimistic locking for concurrent user updates (e.g., password changes).
  </action>
  <verify>grep -n "VersionColumn" apps/auth-service/src/infrastructure/database/user.orm-entity.ts</verify>
  <done>@VersionColumn found in auth-service user ORM entity</done>
</task>

## Success Criteria
- [ ] `synchronize: false` in all 6 DB-backed services
- [ ] `typeorm.config.ts` exists in all 6 services
- [ ] Migration scripts (`migration:generate`, `migration:run`, `migration:revert`) in all 6 `package.json` files
- [ ] `@VersionColumn()` on all aggregate root ORM entities (order, product, user-service user, payment, inventory, auth-service user)
- [ ] `pnpm -r build` passes with zero errors
