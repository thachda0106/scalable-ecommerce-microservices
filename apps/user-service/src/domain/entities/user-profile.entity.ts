import { UserId } from '../value-objects/user-id.vo';

export interface UserProfileProps {
  userId: UserId;
  displayName: string | null;
  avatar: string | null;
  bio: string | null;
  phoneNumber: string | null;
  dateOfBirth: Date | null;
  updatedAt: Date;
}

export interface UpdateUserProfileProps {
  displayName?: string | null;
  avatar?: string | null;
  bio?: string | null;
  phoneNumber?: string | null;
  dateOfBirth?: Date | null;
}

export class UserProfile {
  private _userId: UserId;
  private _displayName: string | null;
  private _avatar: string | null;
  private _bio: string | null;
  private _phoneNumber: string | null;
  private _dateOfBirth: Date | null;
  private _updatedAt: Date;

  private constructor() {}

  static create(userId: UserId): UserProfile {
    const profile = new UserProfile();
    profile._userId = userId;
    profile._displayName = null;
    profile._avatar = null;
    profile._bio = null;
    profile._phoneNumber = null;
    profile._dateOfBirth = null;
    profile._updatedAt = new Date();
    return profile;
  }

  static reconstitute(props: UserProfileProps): UserProfile {
    const profile = new UserProfile();
    profile._userId = props.userId;
    profile._displayName = props.displayName;
    profile._avatar = props.avatar;
    profile._bio = props.bio;
    profile._phoneNumber = props.phoneNumber;
    profile._dateOfBirth = props.dateOfBirth;
    profile._updatedAt = props.updatedAt;
    return profile;
  }

  update(props: UpdateUserProfileProps): void {
    if (props.displayName !== undefined) this._displayName = props.displayName;
    if (props.avatar !== undefined) this._avatar = props.avatar;
    if (props.bio !== undefined) this._bio = props.bio;
    if (props.phoneNumber !== undefined) this._phoneNumber = props.phoneNumber;
    if (props.dateOfBirth !== undefined) this._dateOfBirth = props.dateOfBirth;
    this._updatedAt = new Date();
  }

  get userId(): UserId {
    return this._userId;
  }
  get displayName(): string | null {
    return this._displayName;
  }
  get avatar(): string | null {
    return this._avatar;
  }
  get bio(): string | null {
    return this._bio;
  }
  get phoneNumber(): string | null {
    return this._phoneNumber;
  }
  get dateOfBirth(): Date | null {
    return this._dateOfBirth;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }

  toJSON() {
    return {
      userId: this._userId.value,
      displayName: this._displayName,
      avatar: this._avatar,
      bio: this._bio,
      phoneNumber: this._phoneNumber,
      dateOfBirth: this._dateOfBirth?.toISOString() ?? null,
      updatedAt: this._updatedAt.toISOString(),
    };
  }
}
