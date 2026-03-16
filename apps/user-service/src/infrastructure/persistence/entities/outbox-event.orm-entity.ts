import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('outbox_events')
export class OutboxEventOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  type: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'boolean', default: false })
  processed: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
