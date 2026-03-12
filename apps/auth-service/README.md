# Auth Service

The Identity & Authentication Service for the eCommerce microservices platform.

## Description

This microservice handles:
- User authentication and authorization (Email/Password & OAuth via Google/GitHub)
- JWT token generation and validation with Argon2 password hashing
- Secure Refresh Token rotation stored dynamically via Redis
- Role-Based Access Control (RBAC) mapping policies
- Identity provisioning and propagation using CQRS & Event Sourcing (Kafka)
- Application-level rate limiting (`@nestjs/throttler`) to prevent brute-force attacks

It is built with NestJS and extensively uses `@nestjs/passport`, `@nestjs/jwt`, `@nestjs/cqrs`, and `@nestjs/microservices`.

## Requirements

You must run the core infrastructure (Redis, PostgreSQL, Kafka) via Docker Compose before starting this service.

```bash
cd ../../docker
docker-compose up -d
```

## Running the app

> **Note:** Due to monorepo structure, we use Webpack to compile the service into a single file to avoid nested `dist` folder issues.

```bash
# development
$ pnpm run start

# watch mode (Recommended)
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

### Port Conflicts

By default, this service integrates on **Port 3001**.
If you encounter an `EADDRINUSE` error, ensure no other processes are using port 3001:

```bash
npx kill-port 3001
pnpm run start:dev
```

## Environment Variables

| Variable | Description | Default |
| -------- | ----------- | ------- |
| `PORT` | The port the service runs on | `3001` |
| `JWT_SECRET` | Secret key for signing tokens | `super-secret-key-change-in-prod` |
| `REDIS_HOST` | Redis cache storage URI | `localhost` |
| `REDIS_PORT` | Redis cache port | `6379` |
| `KAFKA_BROKERS` | CSV List of Bootstrap servers | `localhost:9092` |
| `GOOGLE_CLIENT_ID` | OAuth2 Google ID | - |
| `GITHUB_CLIENT_ID` | OAuth2 GitHub ID | - |
