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
  amount: z.number(),
  reason: z.string(),
  status: z.literal('FAILED'),
  schemaVersion: z.literal(1),
  header: EventHeaderSchema,
});

// ─── TypeScript Interfaces ─────────────────────────
export interface PaymentProcessedEvent {
  orderId: string;
  paymentId: string;
  amount: number;
  status: 'SUCCESS';
  schemaVersion: number;
  header: {
    timestamp: string;
    correlationId: string;
  };
}

export interface PaymentFailedEvent {
  orderId: string;
  amount: number;
  reason: string;
  status: 'FAILED';
  schemaVersion: number;
  header: {
    timestamp: string;
    correlationId: string;
  };
}
