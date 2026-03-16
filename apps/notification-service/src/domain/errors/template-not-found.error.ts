export class TemplateNotFoundError extends Error {
  constructor(public readonly templateSlug: string) {
    super(`Notification template not found: ${templateSlug}`);
    this.name = 'TemplateNotFoundError';
  }
}
