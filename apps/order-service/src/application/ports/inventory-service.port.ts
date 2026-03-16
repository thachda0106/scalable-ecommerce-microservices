export const INVENTORY_SERVICE = Symbol('INVENTORY_SERVICE');

export interface IInventoryService {
  reserveInventory(
    orderId: string,
    items: { productId: string; quantity: number }[],
  ): Promise<void>;
  releaseInventory(orderId: string): Promise<void>;
}
