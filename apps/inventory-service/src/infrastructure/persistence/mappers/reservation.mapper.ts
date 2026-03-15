import { StockReservation } from '../../../domain/entities/stock-reservation';
import { StockReservationOrmEntity } from '../entities/stock-reservation.orm-entity';
import { ReservationStatus } from '../../../domain/value-objects/reservation-status.vo';

export class ReservationMapper {
  static toDomain(orm: StockReservationOrmEntity): StockReservation {
    return StockReservation.reconstitute({
      id: orm.id,
      productId: orm.productId,
      referenceId: orm.referenceId,
      referenceType: orm.referenceType as 'CART' | 'ORDER',
      quantity: orm.quantity,
      status: orm.status as ReservationStatus,
      expiresAt: orm.expiresAt,
      idempotencyKey: orm.idempotencyKey,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
    });
  }

  static toOrm(domain: StockReservation): StockReservationOrmEntity {
    const orm = new StockReservationOrmEntity();
    orm.id = domain.id;
    orm.productId = domain.productId;
    orm.referenceId = domain.referenceId;
    orm.referenceType = domain.referenceType;
    orm.quantity = domain.quantity;
    orm.status = domain.status;
    orm.expiresAt = domain.expiresAt;
    orm.idempotencyKey = domain.idempotencyKey;
    orm.createdAt = domain.createdAt;
    orm.updatedAt = domain.updatedAt;
    return orm;
  }
}
