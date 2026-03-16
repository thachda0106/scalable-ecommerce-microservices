import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity('outbox_events')
export class OutboxEventOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  type: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ default: false })
  processed: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
