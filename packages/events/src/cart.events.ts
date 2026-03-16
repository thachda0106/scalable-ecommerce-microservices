import { z } from 'zod';

// ─── Topic Constants ───────────────────────────────
export const CART_TOPICS = {
  ITEM_ADDED: 'cart.item_added',
  ITEM_REMOVED: 'cart.item_removed',
  CLEARED: 'cart.cleared',
  EXPIRED: 'cart.expired',
} as const;

// ─── Zod Schemas ───────────────────────────────────
export const CartItemAddedSchema = z.object({
  cartId: z.string().uuid(),
  userId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  schemaVersion: z.literal(1),
});

export const CartItemRemovedSchema = z.object({
  cartId: z.string().uuid(),
  userId: z.string().uuid(),
  productId: z.string().uuid(),
  schemaVersion: z.literal(1),
});

export const CartClearedSchema = z.object({
  cartId: z.string().uuid(),
  userId: z.string().uuid(),
  schemaVersion: z.literal(1),
});

export const CartExpiredSchema = z.object({
  cartId: z.string().uuid(),
  userId: z.string().uuid(),
  reason: z.string().optional(),
  schemaVersion: z.literal(1),
});

// ─── TypeScript Interfaces ─────────────────────────
export type CartItemAddedEvent = z.infer<typeof CartItemAddedSchema>;
export type CartItemRemovedEvent = z.infer<typeof CartItemRemovedSchema>;
export type CartClearedEvent = z.infer<typeof CartClearedSchema>;
export type CartExpiredEvent = z.infer<typeof CartExpiredSchema>;
