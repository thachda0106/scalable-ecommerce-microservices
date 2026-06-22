import { z } from 'zod';

// ─── Topic Constants ───────────────────────────────
export const PRODUCT_TOPICS = {
  CREATED: 'product.created',
  UPDATED: 'product.updated',
  DELETED: 'product.deleted',
  STOCK_UPDATED: 'product.stock_updated',
} as const;

// ─── Zod Schemas ───────────────────────────────────
export const ProductCreatedSchema = z.object({
  productId: z.string().uuid(),
  name: z.string(),
  price: z.number().positive(),
  categoryId: z.string().optional(),
  schemaVersion: z.literal(1),
});

export const ProductUpdatedSchema = z.object({
  productId: z.string().uuid(),
  changes: z.record(z.unknown()).refine(
    (obj) => Object.keys(obj).length > 0,
    'changes must not be empty',
  ).refine(
    (obj) => Object.keys(obj).length <= 50,
    'changes must not exceed 50 keys',
  ),
  schemaVersion: z.literal(1),
});

export const ProductDeletedSchema = z.object({
  productId: z.string().uuid(),
  schemaVersion: z.literal(1),
});

export const ProductStockUpdatedSchema = z.object({
  productId: z.string().uuid(),
  previousStock: z.number().int(),
  newStock: z.number().int(),
  schemaVersion: z.literal(1),
});

// ─── TypeScript Interfaces ─────────────────────────
export type ProductCreatedEvent = z.infer<typeof ProductCreatedSchema>;
export type ProductUpdatedEvent = z.infer<typeof ProductUpdatedSchema>;
export type ProductDeletedEvent = z.infer<typeof ProductDeletedSchema>;
export type ProductStockUpdatedEvent = z.infer<typeof ProductStockUpdatedSchema>;
