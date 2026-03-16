import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { NotificationTemplate } from '../../../domain/entities/notification-template';
import { ITemplateRepository } from '../../../domain/ports/template-repository.port';
import { createTemplateSeeds } from '../../templates/template-seed';

@Injectable()
export class InMemoryTemplateRepository
  implements ITemplateRepository, OnModuleInit
{
  private readonly logger = new Logger(InMemoryTemplateRepository.name);
  private readonly templates: Map<string, NotificationTemplate> = new Map();

  async onModuleInit(): Promise<void> {
    const seeds = createTemplateSeeds();
    for (const template of seeds) {
      this.templates.set(template.slug, template);
    }
    this.logger.log(`Seeded ${seeds.length} notification templates`);
  }

  async findBySlug(slug: string): Promise<NotificationTemplate | null> {
    return this.templates.get(slug) || null;
  }

  async findAll(): Promise<NotificationTemplate[]> {
    return Array.from(this.templates.values());
  }

  async save(template: NotificationTemplate): Promise<void> {
    this.templates.set(template.slug, template);
    this.logger.debug(`Template '${template.slug}' saved`);
  }
}
