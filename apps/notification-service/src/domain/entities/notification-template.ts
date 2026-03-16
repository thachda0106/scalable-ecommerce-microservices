import { NotificationChannel } from '../enums/notification-channel.enum';

interface TemplateProps {
  slug: string;
  name: string;
  channel: NotificationChannel;
  subjectTemplate: string;
  bodyTemplate: string;
  requiredVariables: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class NotificationTemplate {
  private readonly props: TemplateProps;

  private constructor(props: TemplateProps) {
    this.props = props;
  }

  // ─── Factory Methods ────────────────────────────────────────────────────────

  public static create(props: {
    slug: string;
    name: string;
    channel: NotificationChannel;
    subjectTemplate: string;
    bodyTemplate: string;
    requiredVariables: string[];
    isActive?: boolean;
  }): NotificationTemplate {
    const now = new Date();
    return new NotificationTemplate({
      slug: props.slug,
      name: props.name,
      channel: props.channel,
      subjectTemplate: props.subjectTemplate,
      bodyTemplate: props.bodyTemplate,
      requiredVariables: props.requiredVariables,
      isActive: props.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    });
  }

  public static reconstitute(props: TemplateProps): NotificationTemplate {
    return new NotificationTemplate(props);
  }

  // ─── Getters ─────────────────────────────────────────────────────────────────

  get slug(): string {
    return this.props.slug;
  }
  get name(): string {
    return this.props.name;
  }
  get channel(): NotificationChannel {
    return this.props.channel;
  }
  get subjectTemplate(): string {
    return this.props.subjectTemplate;
  }
  get bodyTemplate(): string {
    return this.props.bodyTemplate;
  }
  get requiredVariables(): string[] {
    return [...this.props.requiredVariables];
  }
  get isActive(): boolean {
    return this.props.isActive;
  }

  // ─── Domain Behaviour ────────────────────────────────────────────────────────

  /**
   * Renders the template by replacing all {{variableName}} placeholders.
   * Validates that all required variables are present.
   *
   * @throws Error if any required variable is missing from the variables map.
   */
  public render(variables: Record<string, string>): {
    subject: string;
    body: string;
  } {
    // Validate required variables
    const missing = this.props.requiredVariables.filter(
      (v) => !(v in variables),
    );
    if (missing.length > 0) {
      throw new Error(
        `Missing required template variables for '${this.props.slug}': ${missing.join(', ')}`,
      );
    }

    const interpolate = (template: string): string =>
      template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
        key in variables ? variables[key] : match,
      );

    return {
      subject: interpolate(this.props.subjectTemplate),
      body: interpolate(this.props.bodyTemplate),
    };
  }

  // ─── Serialisation ───────────────────────────────────────────────────────────

  public toJSON() {
    return {
      slug: this.props.slug,
      name: this.props.name,
      channel: this.props.channel,
      subjectTemplate: this.props.subjectTemplate,
      bodyTemplate: this.props.bodyTemplate,
      requiredVariables: [...this.props.requiredVariables],
      isActive: this.props.isActive,
      createdAt: this.props.createdAt.toISOString(),
      updatedAt: this.props.updatedAt.toISOString(),
    };
  }
}
