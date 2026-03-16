import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
  VersionColumn,
} from 'typeorm';
import { OrderItemOrmEntity } from './order-item.orm-entity';

@Entity('orders')
@Index(['userId', 'status'])
export class OrderOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  @Index()
  userId: string;

  @Column({ type: 'varchar', length: 50 })
  @Index()
  status: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  totalAmount: number;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ type: 'timestamptz' })
  @Index()
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => OrderItemOrmEntity, (item) => item.order, {
    cascade: true,
    eager: true,
  })
  items: OrderItemOrmEntity[];
}
