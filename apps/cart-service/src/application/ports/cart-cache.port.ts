import { Cart } from '../../domain/entities/cart.entity';

export const CART_CACHE = Symbol('CART_CACHE');

export interface ICartCache {
  get(userId: string): Promise<Cart | null>;
  set(userId: string, cart: Cart): Promise<void>;
  invalidate(userId: string): Promise<void>;
}
