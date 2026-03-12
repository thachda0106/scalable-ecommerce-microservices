export class Password {
  private constructor(private readonly value: string) {}

  public static create(hashedPassword: string): Password {
    if (!hashedPassword) {
      throw new Error('Password hash cannot be empty');
    }

    return new Password(hashedPassword);
  }

  public getValue(): string {
    return this.value;
  }
}
