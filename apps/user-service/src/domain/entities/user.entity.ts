import { UserId } from '../value-objects/user-id.vo';
import { Email } from '../value-objects/email.vo';
import { Username } from '../value-objects/username.vo';
import { UserStatus, UserStatusEnum } from '../value-objects/user-status.vo';
import { UserProfile, UpdateUserProfileProps } from './user-profile.entity';
import { UserSettings, UpdateUserSettingsProps } from './user-settings.entity';
import { BaseDomainEvent } from '../events/base-domain.event';
import { UserCreatedEvent } from '../events/user-created.event';
import { UserUpdatedEvent } from '../events/user-updated.event';
import { UserSuspendedEvent } from '../events/user-suspended.event';
import { UserReactivatedEvent } from '../events/user-reactivated.event';
import { UserDeletedEvent } from '../events/user-deleted.event';
import { InvalidUserStatusTransitionError } from '../errors/invalid-user-status-transition.error';
import { InvalidUserOperationError } from '../errors/invalid-user-operation.error';

export interface CreateUserProps {
  email: string;
  username: string;
}

export interface ReconstituteUserProps {
  id: string;
  email: string;
  username: string;
  status: UserStatusEnum;
  profile: UserProfile;
  settings: UserSettings;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export class User {
  private _id: UserId;
  private _email: Email;
  private _username: Username;
  private _status: UserStatus;
  private _profile: UserProfile;
  private _settings: UserSettings;
  private _version: number;
  private _createdAt: Date;
  private _updatedAt: Date;
  private _domainEvents: BaseDomainEvent[] = [];

  private constructor() {}

  static create(props: CreateUserProps): User {
    const user = new User();
    user._id = UserId.generate();
    user._email = Email.create(props.email);
    user._username = Username.create(props.username);
    user._status = UserStatus.active();
    user._version = 1;
    user._createdAt = new Date();
    user._updatedAt = new Date();
    user._profile = UserProfile.create(user._id);
    user._settings = UserSettings.create(user._id);

    user._domainEvents.push(
      new UserCreatedEvent(
        user._id.value,
        user._email.value,
        user._username.value,
      ),
    );

    return user;
  }

  static reconstitute(props: ReconstituteUserProps): User {
    const user = new User();
    user._id = UserId.create(props.id);
    user._email = Email.create(props.email);
    user._username = Username.create(props.username);
    user._status = UserStatus.create(props.status);
    user._profile = props.profile;
    user._settings = props.settings;
    user._version = props.version;
    user._createdAt = props.createdAt;
    user._updatedAt = props.updatedAt;
    return user;
  }

  // ─── Domain Behaviors ─────────────────────────────────────────────────

  updateEmail(newEmail: Email): void {
    this.ensureNotDeleted('updateEmail');
    this._email = newEmail;
    this._updatedAt = new Date();

    this._domainEvents.push(new UserUpdatedEvent(this._id.value, ['email']));
  }

  updateUsername(newUsername: Username): void {
    this.ensureNotDeleted('updateUsername');
    this._username = newUsername;
    this._updatedAt = new Date();

    this._domainEvents.push(new UserUpdatedEvent(this._id.value, ['username']));
  }

  updateProfile(props: UpdateUserProfileProps): void {
    this.ensureNotDeleted('updateProfile');
    this._profile.update(props);
    this._updatedAt = new Date();

    this._domainEvents.push(new UserUpdatedEvent(this._id.value, ['profile']));
  }

  updateSettings(props: UpdateUserSettingsProps): void {
    this.ensureNotDeleted('updateSettings');
    this._settings.update(props);
    this._updatedAt = new Date();

    this._domainEvents.push(new UserUpdatedEvent(this._id.value, ['settings']));
  }

  suspend(reason: string): void {
    this.transitionStatus(UserStatusEnum.SUSPENDED);

    this._domainEvents.push(new UserSuspendedEvent(this._id.value, reason));
  }

  reactivate(): void {
    this.transitionStatus(UserStatusEnum.ACTIVE);

    this._domainEvents.push(new UserReactivatedEvent(this._id.value));
  }

  delete(): void {
    this.transitionStatus(UserStatusEnum.DELETED);

    this._domainEvents.push(new UserDeletedEvent(this._id.value));
  }

  // ─── Event Handling ──────────────────────────────────────────────────

  pullDomainEvents(): BaseDomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }

  // ─── Private Helpers ─────────────────────────────────────────────────

  private transitionStatus(target: UserStatusEnum): void {
    if (!this._status.canTransitionTo(target)) {
      throw new InvalidUserStatusTransitionError(this._status.value, target);
    }
    this._status = this._status.transitionTo(target);
    this._updatedAt = new Date();
  }

  private ensureNotDeleted(operation: string): void {
    if (this._status.value === UserStatusEnum.DELETED) {
      throw new InvalidUserOperationError(
        operation,
        'Cannot perform operation on a deleted user',
      );
    }
  }

  // ─── Getters ─────────────────────────────────────────────────────────

  get id(): UserId {
    return this._id;
  }
  get email(): Email {
    return this._email;
  }
  get username(): Username {
    return this._username;
  }
  get status(): UserStatus {
    return this._status;
  }
  get profile(): UserProfile {
    return this._profile;
  }
  get settings(): UserSettings {
    return this._settings;
  }
  get version(): number {
    return this._version;
  }
  get createdAt(): Date {
    return this._createdAt;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }

  toJSON() {
    return {
      id: this._id.value,
      email: this._email.value,
      username: this._username.value,
      status: this._status.value,
      profile: this._profile.toJSON(),
      settings: this._settings.toJSON(),
      version: this._version,
      createdAt: this._createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString(),
    };
  }
}
