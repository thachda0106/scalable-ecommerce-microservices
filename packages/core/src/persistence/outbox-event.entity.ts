import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

/**
 * Shared outbox event entity for the Transactional Outbox pattern.
 * Each service using UnitOfWork should register this entity in its TypeORM config.
 * The OutboxRelayService polls unprocessed entries and publishes them to Kafka.
 */
@Entity('outbox_events')
export class OutboxEventEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  type!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'boolean', default: false })
  processed!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
