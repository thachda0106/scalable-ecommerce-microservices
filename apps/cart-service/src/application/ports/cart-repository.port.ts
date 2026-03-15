// Re-export domain repository interface — the contract lives in the domain layer.
// The DI token stays here as it's an application/DI concern.
export { ICartRepository } from '../../domain/repositories/cart-repository.interface';

export const CART_REPOSITORY = Symbol('CART_REPOSITORY');
