# Security Architecture

> **Purpose:** How the platform protects user data, prevents attacks, and enforces access control.

---

## Security Layers

```
  Internet
     │
  ┌──┴───────────┐
  │ CloudFront   │  Layer 1: CDN + WAF (DDoS, SQLi, XSS, rate limit)
  │ + WAF        │
  └──────┬───────┘
  ┌──────┴───────┐
  │ ALB (HTTPS)  │  Layer 2: TLS termination, SSL certificate
  └──────┬───────┘
  ┌──────┴───────┐
  │ API Gateway  │  Layer 3: JWT validation, rate limiting, CORS
  └──────┬───────┘
  ┌──────┴───────┐
  │ Services     │  Layer 4: RBAC guards, input validation, tenant isolation
  └──────┬───────┘
  ┌──────┴───────┐
  │ Data Tier    │  Layer 5: Encryption at rest, SG isolation, no public access
  └──────────────┘
```

## Authentication Flow

```
1. User POST /auth/login with credentials
2. Auth Service verifies password (bcrypt, cost 12)
3. Auth Service generates JWT (RS256):
   { userId, tenantId, roles: ["customer"], exp: 15min }
4. Auth Service stores refresh token in Redis (7-day TTL)
5. Client sends JWT in Authorization: Bearer header
6. API Gateway validates JWT signature (public key)
7. API Gateway forwards userId + tenantId to backend service
8. Backend service enforces RBAC via @Roles() guard
```

## Authorization (RBAC)

| Role | Permissions |
|------|------------|
| `customer` | View products, manage own cart/orders/profile |
| `admin` | All customer + manage products/inventory, view all orders |
| `super_admin` | All admin + manage users, view system metrics |

## Data Protection

| Data | Protection |
|------|-----------|
| Passwords | bcrypt hash (cost 12), never stored in plain text |
| JWT tokens | RS256 signed, 15-min expiry, Redis blacklist for revocation |
| Database | Encryption at rest (KMS), TLS in transit |
| PII in logs | Redacted (email → `e***@d.com`, phone → `***1234`) |
| Credit cards | Never touch our system — Stripe tokenization |
| Secrets | AWS Secrets Manager with auto-rotation |
| S3 | Block public access, SSE encryption |

## Input Validation

- All DTOs use `class-validator` decorators
- SQL injection prevented by TypeORM parameterized queries
- XSS prevented by WAF rules + no HTML rendering
- CORS whitelist: only known frontend origins
- Rate limiting: 100 req/min per user, 1000 req/min per IP

## Multi-Tenancy

- `tenantId` embedded in JWT
- `TenantContextMiddleware` extracts and sets context
- All database queries scoped: `WHERE tenant_id = :tenantId`
- Base repository enforces tenant scope automatically
