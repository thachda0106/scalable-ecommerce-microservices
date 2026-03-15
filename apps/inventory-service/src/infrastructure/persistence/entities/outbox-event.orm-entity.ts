import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('outbox_events')
export class OutboxEventOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  type: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'boolean', default: false })
  processed: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
