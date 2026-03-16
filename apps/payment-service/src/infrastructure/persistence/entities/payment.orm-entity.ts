import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  VersionColumn,
  Index,
} from 'typeorm';

@Entity('payment_transactions')
export class PaymentOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  @Index()
  orderId: string;

  @Column()
  userId: string;

  @Column({ type: 'int' })
  amountInCents: number;

  @Column({ length: 3, default: 'USD' })
  currency: string;

  @Column({ length: 20 })
  status: string;

  @Column({ length: 20 })
  provider: string;

  @Column({ nullable: true })
  transactionId: string;

  @Column({ nullable: true, unique: true })
  @Index({ unique: true })
  idempotencyKey: string;

  @Column({ nullable: true })
  failReason: string;

  @VersionColumn()
  version: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

