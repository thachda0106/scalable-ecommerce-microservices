# Auth Service

The Identity & Authentication Service for the eCommerce microservices platform.

## Description

This microservice handles:
- User authentication and authorization
- JWT token generation and validation
- Identity provisioning and propagation

It is built with NestJS and uses `@nestjs/passport` and `@nestjs/jwt`.

## Requirements

You must run the core infrastructure (like Redis & PostgreSQL) via Docker Compose before starting this service if they are needed plugins.

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

By default, this service attempts to run on **Port 3001**.
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

