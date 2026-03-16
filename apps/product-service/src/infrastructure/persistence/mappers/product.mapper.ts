import { Product } from '../../../domain/entities/product.entity';
import { ProductStatusEnum } from '../../../domain/value-objects/product-status.vo';
import { ProductOrmEntity } from '../entities/product.orm-entity';

export class ProductMapper {
  static toDomain(orm: ProductOrmEntity): Product {
    return Product.reconstitute({
      id: orm.id,
      name: orm.name,
      description: orm.description,
      priceInCents: orm.price,
      currency: orm.currency,
      categoryId: orm.categoryId,
      status: orm.status as ProductStatusEnum,
      version: orm.version,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
    });
  }

  static toPersistence(domain: Product): ProductOrmEntity {
    const orm = new ProductOrmEntity();
    orm.id = domain.id.value;
    orm.name = domain.name;
    orm.description = domain.description;
    orm.price = domain.price.amountInCents;
    orm.currency = domain.price.currency;
    orm.categoryId = domain.categoryId;
    orm.status = domain.status.value;
    orm.version = domain.version;
    orm.createdAt = domain.createdAt;
    orm.updatedAt = domain.updatedAt;
    return orm;
  }
}

