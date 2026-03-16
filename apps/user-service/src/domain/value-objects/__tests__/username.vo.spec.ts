import { Username } from '../username.vo';
import { DomainException } from '../../errors/domain-exception';

describe('Username', () => {
  it('should create valid username', () => {
    const username = Username.create('John_Doe123');
    expect(username.value).toBe('john_doe123'); // normalized to lowercase
  });

  it('should reject too short', () => {
    expect(() => Username.create('ab')).toThrow(DomainException);
  });

  it('should reject too long', () => {
    expect(() => Username.create('a'.repeat(31))).toThrow(DomainException);
  });

  it('should reject special characters', () => {
    expect(() => Username.create('user@name')).toThrow(DomainException);
    expect(() => Username.create('user name')).toThrow(DomainException);
    expect(() => Username.create('user-name')).toThrow(DomainException);
  });

  it('should accept underscores', () => {
    const username = Username.create('valid_user');
    expect(username.value).toBe('valid_user');
  });

  it('should support case-insensitive equals', () => {
    const a = Username.create('TestUser');
    const b = Username.create('testuser');
    expect(a.equals(b)).toBe(true);
  });
});
