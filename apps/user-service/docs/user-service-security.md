# User Service Security

## Input Validation

### DTO Layer (class-validator)
- `CreateUserDto`: Email format validation, username regex (alphanumeric + underscores, 3-30 chars)
- `UpdateUserDto`: Optional fields with same validation rules
- `UpdateUserProfileDto`: String length limits (displayName ≤ 100, bio ≤ 500), date format validation
- `SuspendUserDto`: Mandatory reason string
- Global `ValidationPipe` with `whitelist: true` strips unknown properties

### Domain Layer (Value Objects)
- `Email`: Regex validation, lowercase normalization
- `Username`: Alphanumeric + underscore regex, length 3-30, lowercase normalization
- `UserStatus`: State machine prevents invalid transitions, throws `InvalidUserStatusTransitionError`

## Rate Limiting

Configured via `@nestjs/throttler`:
- **Default**: 100 requests per 60 seconds per IP
- Configurable via `THROTTLE_TTL` and `THROTTLE_LIMIT` env vars
- Complements API Gateway-level global rate limiting

## Audit Logging

Security-critical operations are logged in structured JSON format:

```json
{
  "timestamp": "2026-03-16T08:00:00.000Z",
  "userId": "uuid",
  "action": "USER_CREATED",
  "targetId": "uuid",
  "details": { "email": "user@example.com" }
}
```

### Audited Actions
| Action | Trigger |
|--------|---------|
| `USER_CREATED` | New account created |
| `USER_DELETED` | Account soft-deleted |
| `USER_SUSPENDED` | Account suspended |
| `USER_REACTIVATED` | Suspended account reactivated |
| `EMAIL_CHANGED` | Email address updated |
| `USERNAME_CHANGED` | Username updated |
| `PROFILE_UPDATED` | Profile fields changed |
| `SETTINGS_UPDATED` | Settings changed |

## Auth/User Service Boundary

| Concern | auth-service | user-service |
|---------|-------------|-------------|
| Password hashing | ✅ | ❌ |
| OAuth/social login | ✅ | ❌ |
| JWT tokens & sessions | ✅ | ❌ |
| Role management | ✅ | ❌ |
| User account lifecycle | ❌ | ✅ |
| Profile management | ❌ | ✅ |
| Notification preferences | ❌ | ✅ |
| User status (suspend/delete) | ❌ | ✅ |

## Soft Delete Strategy

User deletion is implemented as a status transition to `DELETED` rather than hard delete:
- User data is preserved for audit trails
- All operations check for `DELETED` status and throw `InvalidUserOperationError`
- `DELETED` is a terminal state — no transitions out
