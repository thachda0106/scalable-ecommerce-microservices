import { Entity, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity('processed_events')
export class ProcessedEventOrmEntity {
  @PrimaryColumn('uuid')
  eventId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  processedAt: Date;
}
