export class Email {
  private constructor(private readonly value: string) {}

  public static create(email: string): Email {
    if (!email) {
      throw new Error('Email cannot be empty');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format');
    }

    return new Email(email.toLowerCase());
  }

  public getValue(): string {
    return this.value;
  }
}
