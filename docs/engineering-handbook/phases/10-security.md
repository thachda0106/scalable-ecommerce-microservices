# Phase 10 — Security

---

## 1. Overview

Protect user data, prevent attacks, and enforce access control across all layers.
Security is not a feature — it's a property of the system that must be verified continuously.

## 2. Goals

- 5-layer defense (CDN/WAF → ALB/TLS → Gateway/JWT → Service/RBAC → Data/Encryption)
- Zero critical/high vulnerabilities before launch
- PII never in logs
- Credit card data never in our system
- Automated security scanning in CI

## 3. Architecture Design

See [Security Architecture](../global/security-architecture.md) for the full 5-layer model.

## 4. Technology Choices

| Component | Choice | Why |
|-----------|--------|-----|
| Authentication | JWT (RS256) | Stateless, asymmetric keys |
| WAF | AWS WAFv2 | Managed rules (SQLi, XSS, rate limit) |
| Secrets | AWS Secrets Manager | Rotation, ECS injection |
| Encryption at rest | KMS | AWS-managed keys |
| Password hashing | bcrypt (cost 12) | Time-tested, resistant to GPU attacks |
| Dep scanning | npm audit + Snyk | Dependency vulnerability detection |
| Container scanning | Trivy | Image vulnerability detection |
| Pen testing | OWASP ZAP | Automated baseline scan |

## 5. Key Design Decisions

| ADR | Decision | Rationale |
|-----|----------|-----------|
| ADR-032 | RS256 over HS256 for JWT | API Gateway validates with public key without JWT secret |
| ADR-033 | 15-min access token, 7-day refresh | Balance security (short access) with UX (long refresh) |
| ADR-034 | Redis blacklist for logout | Revoke tokens without DB query on every request |
| ADR-035 | Stripe tokenization | PCI DSS compliance — card data never enters our system |

## 6. Data Flow / Request Flow

**Auth flow:**
```
  Register → bcrypt hash → DB → JWT generated → returned to client
  Login → verify password → JWT generated → refresh token to Redis
  Request → API Gateway → verify JWT signature (public key)
         → extract userId, tenantId, roles → forward to service
  Logout → blacklist token in Redis (TTL = remaining token life)
```

## 7. Components Involved

| Component | Security Responsibility |
|-----------|----------------------|
| CloudFront + WAF | DDoS, SQLi, XSS blocking |
| ALB | TLS termination (HTTPS only) |
| API Gateway | JWT validation, rate limiting, CORS |
| Each service | @Roles() guard, input validation, tenant isolation |
| Database | Encryption at rest, SG isolation, no public access |
| Secrets Manager | Credential storage, rotation |

## 8. Implementation Plan

| Week | Steps |
|------|-------|
| Week 1 | Security code review (auth flows, RBAC, input validation), dep scan, container scan |
| Week 2 | OWASP ZAP scan, fix all critical/high, WAF rule verification, PII audit |

## 9. Tasks Checklist

```
- [ ] Code review: auth flows (register, login, refresh, logout)
- [ ] Code review: RBAC on all endpoints
- [ ] Code review: input validation (class-validator on all DTOs)
- [ ] Code review: SQL injection prevention (parameterized queries)
- [ ] npm audit → zero critical/high vulnerabilities
- [ ] Trivy scan → zero critical/high in all Docker images
- [ ] OWASP ZAP scan → fix all findings
- [ ] Verify CORS whitelist (no wildcard *)
- [ ] Verify HTTPS everywhere (HTTP → HTTPS redirect)
- [ ] Verify secrets NOT in source code / environment files
- [ ] Verify PII redacted in all log outputs
- [ ] Verify S3 buckets block public access
- [ ] Verify security groups (no 0.0.0.0/0 to data tier)
- [ ] Enable CloudTrail for API audit logging
- [ ] WAF: verify SQLi, XSS, rate limit rules work
- [ ] Document security posture for compliance review
```

## 10. Deliverables

| Deliverable | Verification |
|-------------|-------------|
| Security audit report | Zero critical/high vulnerabilities |
| WAF blocking attacks | Test with malicious payloads |
| PII redacted | grep logs for emails/phones → none found |
| All secrets in Secrets Manager | No secrets in code or .env files |
| OWASP ZAP report clean | No medium+ findings |

## 11. Dependencies

- Phase 05 (JWT guard, roles guard implemented in core)
- Phase 06 (all services built with auth decorators)
- Phase 04 (WAF, security groups, Secrets Manager provisioned)

## 12. Risks

| Risk | Mitigation |
|------|-----------|
| JWT secret leaked | RS256 (private key only on auth service) |
| Dependency vulnerability (zero-day) | Automated npm audit in CI, Snyk alerts |
| PII in logs discovered post-launch | Pre-launch log audit + PII redaction middleware |

## 13. Common Mistakes

- HS256 for JWT (shared secret → Gateway needs JWT secret)
- Storing passwords with MD5 or SHA256 (use bcrypt)
- Wildcard CORS allowed origins
- Security groups with 0.0.0.0/0 "for testing"
- Secrets in `.env` files committed to git
- Logging full request bodies (contains PII)

## 14. Best Practices

- Automated security scanning in every CI run
- Principle of least privilege for IAM roles
- Never store credit card data — use Stripe tokenization
- Rotate secrets regularly (Secrets Manager auto-rotation)
- Defense in depth — don't rely on a single layer
