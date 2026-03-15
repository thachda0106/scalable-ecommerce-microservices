import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('stock_movements')
export class StockMovementOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column('uuid')
  @Index('idx_movements_product')
  productId: string;

  @Column({ type: 'varchar', length: 20 })
  movementType: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'uuid', nullable: true })
  referenceId: string;

  @Column({ type: 'int' })
  previousAvailable: number;

  @Column({ type: 'int' })
  newAvailable: number;

  @Column({ type: 'int' })
  previousReserved: number;

  @Column({ type: 'int' })
  newReserved: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  performedBy: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  correlationId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  @Index('idx_movements_created')
  createdAt: Date;
}
