import { Email } from '../email.vo';
import { DomainException } from '../../errors/domain-exception';

describe('Email', () => {
  it('should create valid email', () => {
    const email = Email.create('Test@Example.com');
    expect(email.value).toBe('test@example.com'); // normalized to lowercase
  });

  it('should reject invalid email', () => {
    expect(() => Email.create('notanemail')).toThrow(DomainException);
    expect(() => Email.create('')).toThrow(DomainException);
    expect(() => Email.create('missing@domain')).toThrow(DomainException);
  });

  it('should support case-insensitive equals', () => {
    const a = Email.create('Test@Example.com');
    const b = Email.create('test@example.com');
    expect(a.equals(b)).toBe(true);
  });

  it('should return false for different emails', () => {
    const a = Email.create('a@example.com');
    const b = Email.create('b@example.com');
    expect(a.equals(b)).toBe(false);
  });
});
