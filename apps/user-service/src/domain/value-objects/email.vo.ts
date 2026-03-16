import { DomainException } from '../errors/domain-exception';

export class Email {
  private readonly _value: string;

  private static readonly EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  private constructor(value: string) {
    this._value = value.toLowerCase();
  }

  static create(email: string): Email {
    if (!email || !Email.EMAIL_REGEX.test(email)) {
      throw new DomainException(
        `Invalid email format: '${email}'`,
        'INVALID_EMAIL',
      );
    }
    return new Email(email);
  }

  get value(): string {
    return this._value;
  }

  equals(other: Email): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
