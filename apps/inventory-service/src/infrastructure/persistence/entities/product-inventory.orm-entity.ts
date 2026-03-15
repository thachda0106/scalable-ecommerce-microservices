import {
  Entity,
  PrimaryColumn,
  Column,
  VersionColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('product_inventory')
export class ProductInventoryOrmEntity {
  @PrimaryColumn('uuid')
  productId: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  sku: string;

  @Column({ type: 'int', default: 0 })
  availableStock: number;

  @Column({ type: 'int', default: 0 })
  reservedStock: number;

  @Column({ type: 'int', default: 0 })
  soldStock: number;

  @Column({ type: 'int', default: 0 })
  totalStock: number;

  @Column({ type: 'int', default: 100 })
  lowStockThreshold: number;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
