import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity('outbox_events')
export class OutboxEvent {
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
