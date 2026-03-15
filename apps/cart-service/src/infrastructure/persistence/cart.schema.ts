/**
 * CartDocument — represents the persisted shape of a Cart.
 * Used by the repository to store/retrieve carts.
 * NOTE: Replace this in-memory schema with a MongoDB document when adding a DB layer.
 */
export interface CartDocument {
  id: string;
  userId: string;
  items: CartItemDocument[];
  updatedAt: Date;
}

export interface CartItemDocument {
  productId: string;
  quantity: number;
  snapshottedPrice: number;
}
