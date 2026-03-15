/**
 * CartDocument — represents the persisted shape of a Cart.
 * Used by the repository to store/retrieve carts from Redis (primary store).
 */
export interface CartDocument {
  id: string;
  userId: string;
  items: CartItemDocument[];
  version: number;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
}

export interface CartItemDocument {
  productId: string;
  quantity: number;
  snapshottedPrice: number;
}
