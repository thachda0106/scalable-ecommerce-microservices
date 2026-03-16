import { Product } from '../../domain/entities/product.entity';

export const PRODUCT_CACHE = Symbol('PRODUCT_CACHE');

export interface IProductCache {
  getById(productId: string): Promise<Product | null>;
  setById(productId: string, product: Product): Promise<void>;
  invalidateById(productId: string): Promise<void>;
}
