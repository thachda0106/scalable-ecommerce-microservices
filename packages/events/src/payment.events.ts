import { z } from 'zod';

export const PAYMENT_TOPICS = {
  PROCESSED: 'payment.processed',
  FAILED: 'payment.failed',
} as const;

// ─── Zod Schemas ───────────────────────────────────
const EventHeaderSchema = z.object({
  timestamp: z.string(),
  correlationId: z.string(),
});

export const PaymentProcessedEventSchema = z.object({
  orderId: z.string(),
  paymentId: z.string(),
  amount: z.number().positive(),
  status: z.literal('SUCCESS'),
  schemaVersion: z.literal(1),
  header: EventHeaderSchema,
});

export const PaymentFailedEventSchema = z.object({
  orderId: z.string(),
  amount: z.number().positive(),
  reason: z.string(),
  status: z.literal('FAILED'),
  schemaVersion: z.literal(1),
  header: EventHeaderSchema,
});

// ─── TypeScript Types (derived from Zod schemas) ────
export type PaymentProcessedEvent = z.infer<typeof PaymentProcessedEventSchema>;
export type PaymentFailedEvent = z.infer<typeof PaymentFailedEventSchema>;
