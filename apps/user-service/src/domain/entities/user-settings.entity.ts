import { UserId } from '../value-objects/user-id.vo';

export interface UserSettingsProps {
  userId: UserId;
  emailNotifications: boolean;
  pushNotifications: boolean;
  smsNotifications: boolean;
  language: string;
  timezone: string;
  updatedAt: Date;
}

export interface UpdateUserSettingsProps {
  emailNotifications?: boolean;
  pushNotifications?: boolean;
  smsNotifications?: boolean;
  language?: string;
  timezone?: string;
}

export class UserSettings {
  private _userId: UserId;
  private _emailNotifications: boolean;
  private _pushNotifications: boolean;
  private _smsNotifications: boolean;
  private _language: string;
  private _timezone: string;
  private _updatedAt: Date;

  private constructor() {}

  static create(userId: UserId): UserSettings {
    const settings = new UserSettings();
    settings._userId = userId;
    settings._emailNotifications = true;
    settings._pushNotifications = true;
    settings._smsNotifications = false;
    settings._language = 'en';
    settings._timezone = 'UTC';
    settings._updatedAt = new Date();
    return settings;
  }

  static reconstitute(props: UserSettingsProps): UserSettings {
    const settings = new UserSettings();
    settings._userId = props.userId;
    settings._emailNotifications = props.emailNotifications;
    settings._pushNotifications = props.pushNotifications;
    settings._smsNotifications = props.smsNotifications;
    settings._language = props.language;
    settings._timezone = props.timezone;
    settings._updatedAt = props.updatedAt;
    return settings;
  }

  update(props: UpdateUserSettingsProps): void {
    if (props.emailNotifications !== undefined)
      this._emailNotifications = props.emailNotifications;
    if (props.pushNotifications !== undefined)
      this._pushNotifications = props.pushNotifications;
    if (props.smsNotifications !== undefined)
      this._smsNotifications = props.smsNotifications;
    if (props.language !== undefined) this._language = props.language;
    if (props.timezone !== undefined) this._timezone = props.timezone;
    this._updatedAt = new Date();
  }

  get userId(): UserId {
    return this._userId;
  }
  get emailNotifications(): boolean {
    return this._emailNotifications;
  }
  get pushNotifications(): boolean {
    return this._pushNotifications;
  }
  get smsNotifications(): boolean {
    return this._smsNotifications;
  }
  get language(): string {
    return this._language;
  }
  get timezone(): string {
    return this._timezone;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }

  toJSON() {
    return {
      userId: this._userId.value,
      emailNotifications: this._emailNotifications,
      pushNotifications: this._pushNotifications,
      smsNotifications: this._smsNotifications,
      language: this._language,
      timezone: this._timezone,
      updatedAt: this._updatedAt.toISOString(),
    };
  }
}
