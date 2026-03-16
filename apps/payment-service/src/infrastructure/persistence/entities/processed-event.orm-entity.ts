import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('processed_events')
export class ProcessedEventOrmEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  @Index({ unique: true })
  eventId: string;

  @Column()
  eventType: string;

  @CreateDateColumn()
  processedAt: Date;
}
