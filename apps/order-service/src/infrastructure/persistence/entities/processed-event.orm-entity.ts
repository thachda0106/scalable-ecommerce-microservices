import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('processed_events')
export class ProcessedEventOrmEntity {
  @PrimaryColumn('varchar')
  eventId: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  eventType: string;

  @CreateDateColumn({ type: 'timestamptz' })
  processedAt: Date;
}
