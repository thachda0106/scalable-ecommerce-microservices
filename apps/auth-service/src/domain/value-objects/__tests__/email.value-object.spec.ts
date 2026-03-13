import { Email } from '../email.value-object';

describe('Email value object', () => {
  it('should create a valid email and normalize to lowercase', () => {
    const email = Email.create('User@Example.COM');
    expect(email.getValue()).toBe('user@example.com');
  });

  it('should throw for empty email', () => {
    expect(() => Email.create('')).toThrow('Email cannot be empty');
  });

  it('should throw for invalid email format', () => {
    expect(() => Email.create('not-an-email')).toThrow('Invalid email format');
    expect(() => Email.create('missing@domain')).toThrow(
      'Invalid email format',
    );
    expect(() => Email.create('@no-local.com')).toThrow('Invalid email format');
  });

  it('should allow valid email formats', () => {
    expect(() => Email.create('a@b.co')).not.toThrow();
    expect(() => Email.create('user+tag@example.org')).not.toThrow();
  });
});
