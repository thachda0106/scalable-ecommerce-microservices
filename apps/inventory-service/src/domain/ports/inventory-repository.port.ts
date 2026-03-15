import { ProductInventory } from '../entities/product-inventory';
import { StockReservation } from '../entities/stock-reservation';
import { StockMovement } from '../entities/stock-movement';

export const INVENTORY_REPOSITORY = Symbol('INVENTORY_REPOSITORY');

export interface IInventoryRepository {
  findByProductId(productId: string): Promise<ProductInventory | null>;
  save(inventory: ProductInventory): Promise<void>;
  saveWithReservationAndMovement(
    inventory: ProductInventory,
    reservation: StockReservation,
    movement: StockMovement,
  ): Promise<void>;
  saveWithMovement(
    inventory: ProductInventory,
    movement: StockMovement,
  ): Promise<void>;
  findReservationsByReference(
    referenceId: string,
    referenceType: string,
  ): Promise<StockReservation[]>;
  findActiveReservation(
    referenceId: string,
    productId: string,
  ): Promise<StockReservation | null>;
  findExpiredReservations(limit: number): Promise<StockReservation[]>;
  saveReservation(reservation: StockReservation): Promise<void>;
  checkIdempotencyKey(key: string): Promise<boolean>;
  saveIdempotencyKey(key: string): Promise<void>;
}
