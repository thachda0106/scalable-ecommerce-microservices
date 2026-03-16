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

// ─── TypeScript Interfaces ─────────────────────────
export interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
}

export interface OrderCreatedEvent {
  orderId: string;
  userId: string;
  items: OrderItem[];
  totalAmount: number;
  schemaVersion: number;
  header: {
    timestamp: string;
    correlationId: string;
  };
}

export interface OrderStateChangedEvent {
  orderId: string;
  newState: 'PENDING' | 'PAYMENT_PROCESSED' | 'INVENTORY_RESERVED' | 'COMPLETED' | 'CANCELLED';
  reason?: string;
  schemaVersion: number;
  header: {
    timestamp: string;
    correlationId: string;
  };
}
