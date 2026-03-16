import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('products')
@Index('idx_products_status', ['status'])
@Index('idx_products_category', ['categoryId'])
@Index('idx_products_created_at', ['createdAt'])
@Index('idx_products_status_category', ['status', 'categoryId'])
export class ProductOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ default: 'USD' })
  currency: string;

  @Column({ nullable: true })
  categoryId: string;

  @Column({ default: 'ACTIVE' })
  status: string;

  @Column({ default: 1 })
  version: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
