import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IProcessedEventRepository } from '../../../domain/ports/processed-event-repository.port';
import { ProcessedEventOrmEntity } from '../entities/processed-event.orm-entity';

@Injectable()
export class TypeOrmProcessedEventRepository
  implements IProcessedEventRepository
{
  constructor(
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly repo: Repository<ProcessedEventOrmEntity>,
  ) {}

  async exists(eventId: string): Promise<boolean> {
    const found = await this.repo.findOneBy({ eventId });
    return !!found;
  }

  async markProcessed(eventId: string, _eventType: string): Promise<void> {
    const entity = new ProcessedEventOrmEntity();
    entity.eventId = eventId;
    await this.repo.save(entity);
  }
}
