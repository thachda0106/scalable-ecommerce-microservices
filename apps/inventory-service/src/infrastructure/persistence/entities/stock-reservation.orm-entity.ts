import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('stock_reservations')
@Index('idx_reservations_reference', ['referenceId', 'referenceType'])
export class StockReservationOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column('uuid')
  @Index('idx_reservations_product')
  productId: string;

  @Column('uuid')
  referenceId: string;

  @Column({ type: 'varchar', length: 20 })
  referenceType: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date;

  @Column({ type: 'varchar', length: 255, unique: true })
  idempotencyKey: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
