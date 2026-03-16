import { DomainException } from '../errors/domain-exception';

export class Username {
  private readonly _value: string;

  private static readonly USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;

  private constructor(value: string) {
    this._value = value.toLowerCase();
  }

  static create(username: string): Username {
    if (!username || !Username.USERNAME_REGEX.test(username)) {
      throw new DomainException(
        `Invalid username '${username}': must be 3-30 characters, alphanumeric and underscores only`,
        'INVALID_USERNAME',
      );
    }
    return new Username(username);
  }

  get value(): string {
    return this._value;
  }

  equals(other: Username): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
