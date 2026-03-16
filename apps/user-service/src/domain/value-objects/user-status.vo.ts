import { InvalidUserStatusTransitionError } from '../errors/invalid-user-status-transition.error';

export enum UserStatusEnum {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  DELETED = 'DELETED',
}

const VALID_TRANSITIONS: Map<UserStatusEnum, UserStatusEnum[]> = new Map([
  [UserStatusEnum.ACTIVE, [UserStatusEnum.SUSPENDED, UserStatusEnum.DELETED]],
  [UserStatusEnum.SUSPENDED, [UserStatusEnum.ACTIVE, UserStatusEnum.DELETED]],
  [UserStatusEnum.DELETED, []],
]);

export class UserStatus {
  private readonly _value: UserStatusEnum;

  private constructor(value: UserStatusEnum) {
    this._value = value;
  }

  static create(value: UserStatusEnum): UserStatus {
    return new UserStatus(value);
  }

  static active(): UserStatus {
    return new UserStatus(UserStatusEnum.ACTIVE);
  }

  get value(): UserStatusEnum {
    return this._value;
  }

  canTransitionTo(target: UserStatusEnum): boolean {
    const allowed = VALID_TRANSITIONS.get(this._value) ?? [];
    return allowed.includes(target);
  }

  transitionTo(target: UserStatusEnum): UserStatus {
    if (!this.canTransitionTo(target)) {
      throw new InvalidUserStatusTransitionError(this._value, target);
    }
    return new UserStatus(target);
  }

  isTerminal(): boolean {
    return this._value === UserStatusEnum.DELETED;
  }

  equals(other: UserStatus): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
