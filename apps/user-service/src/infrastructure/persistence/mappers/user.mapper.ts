import { User } from '../../../domain/entities/user.entity';
import { UserProfile } from '../../../domain/entities/user-profile.entity';
import { UserSettings } from '../../../domain/entities/user-settings.entity';
import { UserId } from '../../../domain/value-objects/user-id.vo';
import { UserStatusEnum } from '../../../domain/value-objects/user-status.vo';
import { UserOrmEntity } from '../entities/user.orm-entity';
import { UserProfileOrmEntity } from '../entities/user-profile.orm-entity';
import { UserSettingsOrmEntity } from '../entities/user-settings.orm-entity';

export class UserMapper {
  static toDomain(orm: UserOrmEntity): User {
    const userId = UserId.create(orm.id);

    const profile = UserProfile.reconstitute({
      userId,
      displayName: orm.profile?.displayName ?? null,
      avatar: orm.profile?.avatar ?? null,
      bio: orm.profile?.bio ?? null,
      phoneNumber: orm.profile?.phoneNumber ?? null,
      dateOfBirth: orm.profile?.dateOfBirth ?? null,
      updatedAt: orm.profile?.updatedAt ?? new Date(),
    });

    const settings = UserSettings.reconstitute({
      userId,
      emailNotifications: orm.settings?.emailNotifications ?? true,
      pushNotifications: orm.settings?.pushNotifications ?? true,
      smsNotifications: orm.settings?.smsNotifications ?? false,
      language: orm.settings?.language ?? 'en',
      timezone: orm.settings?.timezone ?? 'UTC',
      updatedAt: orm.settings?.updatedAt ?? new Date(),
    });

    return User.reconstitute({
      id: orm.id,
      email: orm.email,
      username: orm.username,
      status: orm.status as UserStatusEnum,
      profile,
      settings,
      version: orm.version,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
    });
  }

  static toPersistence(domain: User): UserOrmEntity {
    const orm = new UserOrmEntity();
    orm.id = domain.id.value;
    orm.email = domain.email.value;
    orm.username = domain.username.value;
    orm.status = domain.status.value;
    orm.version = domain.version;
    orm.createdAt = domain.createdAt;
    orm.updatedAt = domain.updatedAt;

    const profileOrm = new UserProfileOrmEntity();
    profileOrm.userId = domain.id.value;
    profileOrm.displayName = domain.profile.displayName;
    profileOrm.avatar = domain.profile.avatar;
    profileOrm.bio = domain.profile.bio;
    profileOrm.phoneNumber = domain.profile.phoneNumber;
    profileOrm.dateOfBirth = domain.profile.dateOfBirth;
    profileOrm.updatedAt = domain.profile.updatedAt;
    orm.profile = profileOrm;

    const settingsOrm = new UserSettingsOrmEntity();
    settingsOrm.userId = domain.id.value;
    settingsOrm.emailNotifications = domain.settings.emailNotifications;
    settingsOrm.pushNotifications = domain.settings.pushNotifications;
    settingsOrm.smsNotifications = domain.settings.smsNotifications;
    settingsOrm.language = domain.settings.language;
    settingsOrm.timezone = domain.settings.timezone;
    settingsOrm.updatedAt = domain.settings.updatedAt;
    orm.settings = settingsOrm;

    return orm;
  }
}
