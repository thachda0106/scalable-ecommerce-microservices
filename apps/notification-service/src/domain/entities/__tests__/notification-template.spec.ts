import { NotificationTemplate } from '../notification-template';
import { NotificationChannel } from '../../enums/notification-channel.enum';

const createTemplate = (overrides: Record<string, unknown> = {}) =>
  NotificationTemplate.create({
    slug: 'test-template',
    name: 'Test Template',
    channel: NotificationChannel.EMAIL,
    subjectTemplate: 'Hello {{userName}}',
    bodyTemplate: 'Order #{{orderId}} for ${{totalAmount}}',
    requiredVariables: ['userName', 'orderId', 'totalAmount'],
    ...overrides,
  });

describe('NotificationTemplate', () => {
  describe('create', () => {
    it('should create a template with given fields', () => {
      const template = createTemplate();
      expect(template.slug).toBe('test-template');
      expect(template.name).toBe('Test Template');
      expect(template.channel).toBe(NotificationChannel.EMAIL);
      expect(template.isActive).toBe(true);
    });

    it('should default isActive to true', () => {
      const template = createTemplate();
      expect(template.isActive).toBe(true);
    });
  });

  describe('render', () => {
    it('should replace all {{variable}} placeholders', () => {
      const template = createTemplate();
      const result = template.render({
        userName: 'John',
        orderId: '123',
        totalAmount: '99.99',
      });

      expect(result.subject).toBe('Hello John');
      expect(result.body).toBe('Order #123 for $99.99');
    });

    it('should throw when a required variable is missing', () => {
      const template = createTemplate();
      expect(() => template.render({ userName: 'John' })).toThrow(
        /Missing required template variables.*orderId, totalAmount/,
      );
    });

    it('should handle templates with no variables', () => {
      const template = createTemplate({
        subjectTemplate: 'Static Subject',
        bodyTemplate: 'Static Body',
        requiredVariables: [],
      });

      const result = template.render({});
      expect(result.subject).toBe('Static Subject');
      expect(result.body).toBe('Static Body');
    });

    it('should leave unreferenced variables untouched', () => {
      const template = createTemplate({
        subjectTemplate: 'Hello {{userName}} {{unknown}}',
        bodyTemplate: 'Body',
        requiredVariables: ['userName'],
      });

      const result = template.render({ userName: 'Jane' });
      expect(result.subject).toBe('Hello Jane {{unknown}}');
    });
  });

  describe('toJSON', () => {
    it('should serialize all fields', () => {
      const template = createTemplate();
      const json = template.toJSON();
      expect(json.slug).toBe('test-template');
      expect(json.requiredVariables).toEqual([
        'userName',
        'orderId',
        'totalAmount',
      ]);
      expect(json.createdAt).toBeDefined();
    });
  });
});
