import { z } from 'zod';

// ─── Topic Constants ───────────────────────────────
export const USER_TOPICS = {
  CREATED: 'user.created',
  UPDATED: 'user.updated',
  DELETED: 'user.deleted',
  SUSPENDED: 'user.suspended',
} as const;

// ─── Zod Schemas ───────────────────────────────────
export const UserCreatedSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  username: z.string(),
  schemaVersion: z.literal(1),
});

export const UserUpdatedSchema = z.object({
  userId: z.string().uuid(),
  changes: z.record(z.unknown()).refine(
    (obj) => Object.keys(obj).length > 0,
    'changes must not be empty',
  ).refine(
    (obj) => Object.keys(obj).length <= 50,
    'changes must not exceed 50 keys',
  ),
  schemaVersion: z.literal(1),
});

export const UserDeletedSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().optional(),
  schemaVersion: z.literal(1),
});

export const UserSuspendedSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string(),
  schemaVersion: z.literal(1),
});

// ─── TypeScript Interfaces ─────────────────────────
export type UserCreatedEvent = z.infer<typeof UserCreatedSchema>;
export type UserUpdatedEvent = z.infer<typeof UserUpdatedSchema>;
export type UserDeletedEvent = z.infer<typeof UserDeletedSchema>;
export type UserSuspendedEvent = z.infer<typeof UserSuspendedSchema>;
