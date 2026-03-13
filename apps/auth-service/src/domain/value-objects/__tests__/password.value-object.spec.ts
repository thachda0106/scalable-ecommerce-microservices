import { Password } from '../password.value-object';

describe('Password value object', () => {
  it('should create a password value object from a valid hash', () => {
    const hash = '$argon2id$v=19$m=65536,t=3,p=4$some-hash';
    const password = Password.create(hash);
    expect(password.getValue()).toBe(hash);
  });

  it('should throw for empty hash', () => {
    expect(() => Password.create('')).toThrow('Password hash cannot be empty');
  });

  it('should preserve the exact hash value', () => {
    const hash = 'any-valid-hash-string';
    expect(Password.create(hash).getValue()).toBe(hash);
  });
});
