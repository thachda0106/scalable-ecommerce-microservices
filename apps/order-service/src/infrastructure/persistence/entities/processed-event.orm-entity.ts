import { Entity, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity('processed_events')
export class ProcessedEventOrmEntity {
  @PrimaryColumn('varchar')
  eventId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  processedAt: Date;
}
