import { z } from 'zod';

export const INVENTORY_TOPICS = {
  RESERVED: 'inventory.reserved',
  RESERVATION_FAILED: 'inventory.reservation_failed',
  RELEASED: 'inventory.released',
} as const;

// ─── Zod Schemas ───────────────────────────────────
const EventHeaderSchema = z.object({
  timestamp: z.string(),
  correlationId: z.string(),
});

export const InventoryItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().positive(),
});

export const InventoryReservedEventSchema = z.object({
  orderId: z.string(),
  items: z.array(InventoryItemSchema),
  schemaVersion: z.literal(1),
  header: EventHeaderSchema,
});

export const InventoryReservationFailedEventSchema = z.object({
  orderId: z.string(),
  items: z.array(InventoryItemSchema),
  reason: z.string(),
  schemaVersion: z.literal(1),
  header: EventHeaderSchema,
});

export const InventoryReleasedEventSchema = z.object({
  orderId: z.string(),
  items: z.array(InventoryItemSchema),
  reason: z.string(),
  schemaVersion: z.literal(1),
  header: EventHeaderSchema,
});

// ─── TypeScript Interfaces ─────────────────────────
export interface InventoryItem {
  productId: string;
  quantity: number;
}

export interface InventoryReservedEvent {
  orderId: string;
  items: InventoryItem[];
  schemaVersion: number;
  header: {
    timestamp: string;
    correlationId: string;
  };
}

export interface InventoryReservationFailedEvent {
  orderId: string;
  items: InventoryItem[];
  reason: string;
  schemaVersion: number;
  header: {
    timestamp: string;
    correlationId: string;
  };
}

export interface InventoryReleasedEvent {
  orderId: string;
  items: InventoryItem[];
  reason: string;
  schemaVersion: number;
  header: {
    timestamp: string;
    correlationId: string;
  };
}
