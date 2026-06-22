import { z } from 'zod';

export const ORDER_TOPICS = {
  CREATED: 'order.created',
  UPDATED: 'order.updated',
  CANCELLED: 'order.cancelled',
  COMPLETED: 'order.completed',
} as const;

// ─── Zod Schemas ───────────────────────────────────
const EventHeaderSchema = z.object({
  timestamp: z.string(),
  correlationId: z.string(),
});

export const OrderItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().positive(),
  price: z.number().positive(),
});

export const OrderCreatedEventSchema = z.object({
  orderId: z.string(),
  userId: z.string(),
  items: z.array(OrderItemSchema),
  totalAmount: z.number().positive(),
  schemaVersion: z.literal(1),
  header: EventHeaderSchema,
});

export const OrderStateChangedEventSchema = z.object({
  orderId: z.string(),
  newState: z.enum(['PENDING', 'PAYMENT_PROCESSED', 'INVENTORY_RESERVED', 'COMPLETED', 'CANCELLED']),
  reason: z.string().optional(),
  schemaVersion: z.literal(1),
  header: EventHeaderSchema,
});

// ─── TypeScript Types (derived from Zod schemas) ────
export type OrderItem = z.infer<typeof OrderItemSchema>;
export type OrderCreatedEvent = z.infer<typeof OrderCreatedEventSchema>;
export type OrderStateChangedEvent = z.infer<typeof OrderStateChangedEventSchema>;
