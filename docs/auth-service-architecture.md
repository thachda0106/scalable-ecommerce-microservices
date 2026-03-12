# Auth Service Architecture

This document describes the architecture, flows, and technical details for the production-grade identity and authentication system of the scalable ecommerce microservices platform.

## 1. Domain-Driven Design (DDD) Architecture

The auth-service follows a strict Domain-Driven Design and Clean Architecture structure to keep business logic isolated from infrastructure concerns.

```text
auth-service
 ├─ src
 │  ├─ domain               # Core business rules, highly isolated
 │  │  ├─ entities          # User, Token, Role representations
 │  │  ├─ value-objects     # Email, Password Hash, Role types
 │  │  └─ events            # Domain events (e.g., UserRegisteredEvent)
 │  │
 │  ├─ application          # Use cases coordinating between domain & infra
 │  │  ├─ commands          # Write operations (RegisterCommand, LoginCommand)
 │  │  ├─ queries           # Read operations (GetUserQuery)
 │  │  ├─ handlers          # CQRS Handlers executing the commands/queries
 │  │  └─ services          # Application services
 │  │
 │  ├─ infrastructure       # External integrations and details
 │  │  ├─ database          # TypeORM repositories, DB entities
 │  │  ├─ redis             # Redis adapters for rate limiting & token storage
 │  │  ├─ kafka             # Kafka producer adapters to publish events
 │  │  └─ jwt               # JWT signing and verification implementation
 │  │
 │  ├─ interfaces           # Primary adapters (entrypoints)
 │  │  ├─ controllers       # HTTP endpoint controllers
 │  │  └─ dto               # Data Transfer Objects for requests/responses
 │  │
 │  └─ main.ts              # Application bootstrap
```

### Layer Responsibilities
- **Domain**: Contains the enterprise logic. Independent of any frameworks or external libraries. Defines interfaces for repositories.
- **Application**: Orchestrates domain objects to fulfill use cases (Login, Register). Depends on the Domain layer.
- **Infrastructure**: Implements interfaces defined by the Application/Domain layer (Database persistence, Kafka message publishing, Redis caching).
- **Interfaces**: Translates HTTP requests into Application layer commands/queries and formats responses.

## 2. JWT Token Strategy & Payload

### JWT Tokens
- **Access Token**: Short-lived (15 minutes). Used for authorization in downstream services.
- **Refresh Token**: Long-lived (7 days). Stored securely. Used to request new Access Tokens. Supports **Refresh Token Rotation** (a new refresh token is issued every time the old one is used) to prevent reply attacks.

### Token Payload (Claims)
The Access Token contains standard claims representing the principal.

```json
{
  "sub": "user_uuid_here",
  "email": "user@example.com",
  "role": "CUSTOMER",
  "tenant_id": "tenant_123",
  "org_id": "org_456",
  "iat": 1710255000,
  "exp": 1710255900
}
```

## 3. Redis Refresh Token Storage Strategy

Refresh tokens are stored in Redis to allow immediate revocation and monitoring of active sessions.

**Key Pattern:**
`refresh:{userId}:{tokenId}` -> Stores the hashed refresh token or metadata.

**Strategy:**
- **TTL Handling**: The TTL in Redis matches the refresh token lifetime (7 days). When the TTL expires, the key is evicted, and exactly matches session expiration.
- **Rotation**: Upon using a refresh token `TokenA`, the server invalidates `refresh:{userId}:{TokenA}`, generates `TokenB`, and stores `refresh:{userId}:{TokenB}`.
- **Revocation**: If a user logs out from a specific device, we delete the exact `refresh:{userId}:{tokenId}`. If "logout everywhere", we delete pattern `refresh:{userId}:*`.

## 4. API Gateway Authentication Integration

The Auth Service strictly issues tokens and handles identity management. The API Gateway is responsible for validation.

1. **Client Header**: Requests arrive at API Gateway with `Authorization: Bearer <token>`.
2. **Gateway Verification**: The Gateway validates the JWT signature (using a shared secret or public key from the Auth Service). It does *not* call the Auth Service for every request.
3. **Identity Injection**: Gateway extracts the payload (`sub`, `role`, `tenant_id`) and injects them as downstream HTTP headers (e.g., `x-user-id`, `x-user-role`).
4. **Unauthorized Requests**: Invalid, missing, or expired tokens are rejected directly at the Gateway with `401 Unauthorized`.

## 5. System Flows

### 5.1 Authentication Flow
1. Client POSTs `/auth/login` with email & password.
2. Auth Service checks rate limits (Redis) to prevent brute force.
3. Service hashes the provided password using Argon2 and compares it with the database record.
4. On success, generates Access Token and Refresh Token.
5. Saves Refresh Token metadata to Redis.
6. Publishes `user.logged_in` Kafka event.
7. Returns both tokens to the client.

### 5.2 Refresh Token Flow
1. Client POSTs `/auth/refresh` with the Refresh Token.
2. Auth Service extracts the token ID and verifies it exists in Redis.
3. If valid, deletes the old token key from Redis.
4. Generates a new Access Token and a new Refresh Token.
5. Saves the new Refresh Token to Redis.
6. Returns both tokens to the client.

### 5.3 OAuth Flow (Google/GitHub)
1. Client initiates OAuth login sequence.
2. Provider redirects back with authorization code.
3. Auth Service exchanges code for provider Access Token.
4. Service fetches user profile from provider.
5. If user exists, generates standard JWT token pair. If not, auto-registers the user.
6. Returns tokens to the client.

### 5.4 Identity Event Flow (Kafka Integration)
The Auth Service acts as the source of truth for identity. Downstream services (Cart, Order, Notifications) keep eventual consistency by subscribing to Auth Service events.

**Published Events:**
- `user.registered`: E.g., Notification service sends welcome email.
- `user.logged_in`: E.g., Analytics service records activity.
- `user.password_changed`: E.g., Security service ends other active sessions.
- `user.deleted`: E.g., GDPR compliant anonymization in downstream services.

## 6. Security Best Practices

- **Password Hashing**: Exclusive use of `argon2` for CPU/Memory hardened secure password hashing.
- **Rate Limiting**: IP-based and User-based lockout protection against credential stuffing.
- **Token Management**: Refresh token rotation mitigates stolen token risks.
- **Secrets Management**: JWT signing keys and OAuth secrets strictly managed via environment variables (or external Secret Managers like AWS Secrets Manager).
- **Audit Logs**: All security-critical actions (login, password reset, revocation) generate structured audit logs.

## 7. Implementation Task Breakdown

This phase will be executed step-by-step:

1. **Setup DDD Scaffold**: Create directories (domain, application, infrastructure, interfaces) and move existing boilerplate.
2. **Domain Layer**: Implement User entity, Email, Password, and Role value objects.
3. **Infrastructure (Database)**: Setup TypeORM integration for PostgreSQL (User model).
4. **Infrastructure (Kafka & Redis)**: Setup Kafka producers and Redis client connections.
5. **Identity Use Cases**: Implement Register, Email Verification, and Login logic. Include `argon2` integration.
6. **JWT Token Generation**: Implement Access/Refresh token generation with correct payload.
7. **Refresh Token Flow**: Implement storing, retrieving, and rotating refresh tokens in Redis.
8. **Security & Rate Limiting**: Implement brute-force protection logic and account lockout.
9. **OAuth Interfaces**: Add Google & GitHub OAuth via Passport.js.
10. **Event Publishing**: Hook application flow to publish Kafka events on registration/login.
