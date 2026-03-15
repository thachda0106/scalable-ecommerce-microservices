import { Cart } from '../../domain/entities/cart.entity';

export const CART_REPOSITORY = Symbol('CART_REPOSITORY');

export interface ICartRepository {
  findByUserId(userId: string): Promise<Cart | null>;
  save(cart: Cart): Promise<void>;
}
