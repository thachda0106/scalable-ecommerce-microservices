import { Cart } from '../entities/cart.entity';

/**
 * Repository interface for Cart aggregate persistence.
 * Lives in the domain layer — implementations are in infrastructure.
 */
export interface ICartRepository {
  findByUserId(userId: string): Promise<Cart | null>;
  save(cart: Cart): Promise<void>;
}
