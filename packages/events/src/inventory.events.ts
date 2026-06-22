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

// ─── TypeScript Types (derived from Zod schemas) ────
export type InventoryItem = z.infer<typeof InventoryItemSchema>;
export type InventoryReservedEvent = z.infer<typeof InventoryReservedEventSchema>;
export type InventoryReservationFailedEvent = z.infer<typeof InventoryReservationFailedEventSchema>;
export type InventoryReleasedEvent = z.infer<typeof InventoryReleasedEventSchema>;
