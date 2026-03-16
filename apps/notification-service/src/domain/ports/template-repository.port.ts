import { NotificationTemplate } from '../entities/notification-template';

export const TEMPLATE_REPOSITORY = Symbol('TEMPLATE_REPOSITORY');

export interface ITemplateRepository {
  findBySlug(slug: string): Promise<NotificationTemplate | null>;
  findAll(): Promise<NotificationTemplate[]>;
  save(template: NotificationTemplate): Promise<void>;
}
