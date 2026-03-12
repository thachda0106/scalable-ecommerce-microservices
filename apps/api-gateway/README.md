# API Gateway

This is the API Gateway service for the scalable e-commerce microservices project. It acts as the single entry point for all client applications, routing requests to the appropriate backend microservices.

## Features

- Request routing to microservices (Auth, Users, Products, Orders, etc.)
- Authentication and Authorization (JWT token validation)
- Rate limiting and throttling
- API documentation

## Project Setup

```bash
$ pnpm install
```

## Running the app

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Test

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```
