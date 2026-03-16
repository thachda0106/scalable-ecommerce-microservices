import { Order } from '../../../domain/entities/order.entity';
import { OrderItem } from '../../../domain/entities/order-item.entity';
import { Money } from '../../../domain/value-objects/money.vo';
import { OrderStatusEnum } from '../../../domain/value-objects/order-status.vo';
import { OrderOrmEntity } from '../entities/order.orm-entity';
import { OrderItemOrmEntity } from '../entities/order-item.orm-entity';

export class OrderMapper {
  static toDomain(orm: OrderOrmEntity): Order {
    const items = (orm.items || []).map((itemOrm) =>
      OrderItem.reconstitute(
        itemOrm.id,
        itemOrm.productId,
        itemOrm.productName,
        itemOrm.quantity,
        Money.fromDecimal(Number(itemOrm.unitPrice), itemOrm.currency),
      ),
    );

    return Order.reconstitute({
      id: orm.id,
      userId: orm.userId,
      items,
      status: orm.status as OrderStatusEnum,
      totalPriceInCents: Math.round(Number(orm.totalAmount) * 100),
      currency: orm.currency,
      version: orm.version,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
    });
  }

  static toPersistence(domain: Order): OrderOrmEntity {
    const orm = new OrderOrmEntity();
    orm.id = domain.id.value;
    orm.userId = domain.userId.value;
    orm.status = domain.status.value;
    orm.totalAmount = domain.totalPrice.toDecimal();
    orm.currency = domain.totalPrice.currency;
    orm.version = domain.version;
    orm.createdAt = domain.createdAt;
    orm.updatedAt = domain.updatedAt;

    orm.items = domain.items.map((item) => {
      const itemOrm = new OrderItemOrmEntity();
      itemOrm.id = item.id;
      itemOrm.orderId = domain.id.value;
      itemOrm.productId = item.productId;
      itemOrm.productName = item.productName;
      itemOrm.quantity = item.quantity;
      itemOrm.unitPrice = item.unitPrice.toDecimal();
      itemOrm.currency = item.unitPrice.currency;
      return itemOrm;
    });

    return orm;
  }
}
