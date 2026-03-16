export class UserId {
  private readonly _value: string;

  private constructor(value: string) {
    this._value = value;
  }

  static create(id: string): UserId {
    if (!id || id.trim().length === 0) {
      throw new Error('UserId cannot be empty');
    }
    return new UserId(id);
  }

  static generate(): UserId {
    return new UserId(crypto.randomUUID());
  }

  get value(): string {
    return this._value;
  }

  equals(other: UserId): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
