import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('outbox_events')
@Index('idx_outbox_unprocessed', ['processed', 'createdAt'])
export class OutboxEventOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  type: string;

  @Column({ type: 'jsonb' })
  payload: any;

  @Column({ default: false })
  processed: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
