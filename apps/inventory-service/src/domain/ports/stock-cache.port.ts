import { ProductInventory } from '../entities/product-inventory';

export const STOCK_CACHE = Symbol('STOCK_CACHE');

export interface IStockCache {
  get(productId: string): Promise<ProductInventory | null>;
  set(productId: string, inventory: ProductInventory): Promise<void>;
  invalidate(productId: string): Promise<void>;
  acquireLock(
    productId: string,
    requestId: string,
    ttlMs?: number,
  ): Promise<boolean>;
  releaseLock(productId: string, requestId: string): Promise<void>;
}
