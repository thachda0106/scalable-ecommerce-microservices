import { ProductInventory } from '../../../domain/entities/product-inventory';
import { ProductInventoryOrmEntity } from '../entities/product-inventory.orm-entity';

export class InventoryMapper {
  static toDomain(orm: ProductInventoryOrmEntity): ProductInventory {
    return ProductInventory.reconstitute({
      productId: orm.productId,
      sku: orm.sku,
      availableStock: orm.availableStock,
      reservedStock: orm.reservedStock,
      soldStock: orm.soldStock,
      totalStock: orm.totalStock,
      lowStockThreshold: orm.lowStockThreshold,
      version: orm.version,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
    });
  }

  static toOrm(domain: ProductInventory): ProductInventoryOrmEntity {
    const orm = new ProductInventoryOrmEntity();
    orm.productId = domain.productId;
    orm.sku = domain.sku;
    orm.availableStock = domain.availableStock;
    orm.reservedStock = domain.reservedStock;
    orm.soldStock = domain.soldStock;
    orm.totalStock = domain.totalStock;
    orm.lowStockThreshold = domain.lowStockThreshold;
    orm.version = domain.version;
    orm.createdAt = domain.createdAt;
    orm.updatedAt = domain.updatedAt;
    return orm;
  }
}
