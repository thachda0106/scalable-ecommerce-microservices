import { z } from 'zod';

// ─── Topic Constants ───────────────────────────────
export const NOTIFICATION_TOPICS = {
  SENT: 'notification.sent',
  FAILED: 'notification.failed',
} as const;

// ─── Zod Schemas ───────────────────────────────────
export const NotificationSentSchema = z.object({
  notificationId: z.string().uuid(),
  channel: z.enum(['EMAIL', 'SMS', 'PUSH', 'IN_APP']),
  recipientId: z.string().uuid(),
  templateId: z.string().optional(),
  schemaVersion: z.literal(1),
});

export const NotificationFailedSchema = z.object({
  notificationId: z.string().uuid(),
  channel: z.enum(['EMAIL', 'SMS', 'PUSH', 'IN_APP']),
  recipientId: z.string().uuid(),
  reason: z.string(),
  retryCount: z.number().int().min(0),
  schemaVersion: z.literal(1),
});

// ─── TypeScript Interfaces ─────────────────────────
export type NotificationSentEvent = z.infer<typeof NotificationSentSchema>;
export type NotificationFailedEvent = z.infer<typeof NotificationFailedSchema>;
