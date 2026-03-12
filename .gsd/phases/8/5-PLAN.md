---
phase: 8
plan: 5
wave: 3
---

# Plan 8.5: OAuth Integration & Event Publishing

## Objective
Extend authentication to support Google/GitHub OAuth providers and publish identity lifecycle events to Kafka for downstream microservices.

## Context
- apps/auth-service/src/infrastructure/kafka/kafka-producer.module.ts
- docs/auth-service-architecture.md

## Tasks

<task type="auto">
  <name>Implement OAuth Interfaces</name>
  <files>
    - apps/auth-service/src/infrastructure/oauth/google.strategy.ts
    - apps/auth-service/src/infrastructure/oauth/github.strategy.ts
    - apps/auth-service/src/infrastructure/oauth/oauth.module.ts
    - apps/auth-service/src/interfaces/controllers/oauth.controller.ts
  </files>
  <action>
    - Install `passport-google-oauth20` and `passport-github2` in auth-service.
    - Implement Passport strategies that execute an OAuth handshake and map external profiles (email, id) to the internal `User` domain entity.
    - Auto-register users if they don't exist.
    - Create endpoints in `OAuthController` to trigger the redirects and accept callbacks.
  </action>
  <verify>npm run build --prefix apps/auth-service</verify>
  <done>Google and GitHub OAuth endpoints exist and integrate with the token generation flow.</done>
</task>

<task type="auto">
  <name>Publish Kafka Lifecycle Events</name>
  <files>
    - apps/auth-service/src/application/handlers/register.handler.ts
    - apps/auth-service/src/application/handlers/login.handler.ts
  </files>
  <action>
    - Inject the Kafka Client proxy into the Register and Login handlers (or use a Domain Event Publisher interactor).
    - Publish `user.registered` upon successful creation.
    - Publish `user.logged_in` upon successful sign in.
    - Ensure failing to publish an event does NOT crash the auth transaction (fire-and-forget or outbox pattern).
  </action>
  <verify>npm run build --prefix apps/auth-service</verify>
  <done>Events are asynchronously published to Kafka without blocking HTTP responses.</done>
</task>

## Success Criteria
- [ ] Users can login without a password using external OAuth providers.
- [ ] Downstream services can observe `user.registered` and `user.logged_in` events.
