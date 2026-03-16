import { Money } from '../money.vo';

describe('Money Value Object', () => {
  it('should create a valid money object', () => {
    const money = Money.fromCents(100, 'USD');
    expect(money.amountInCents).toBe(100);
    expect(money.currency).toBe('USD');
  });

  it('should default to USD currency', () => {
    const money = Money.fromCents(50);
    expect(money.amountInCents).toBe(50);
    expect(money.currency).toBe('USD');
  });

  it('should format correctly using toString', () => {
    const money = Money.fromCents(150, 'EUR');
    expect(money.toString()).toBe('1.50 EUR');
  });

  it('should compare equality correctly', () => {
    const moneyA = Money.fromCents(100, 'USD');
    const moneyB = Money.fromCents(100, 'USD');
    const moneyC = Money.fromCents(200, 'USD');
    const moneyD = Money.fromCents(100, 'EUR');

    expect(moneyA.equals(moneyB)).toBe(true);
    expect(moneyA.equals(moneyC)).toBe(false);
    expect(moneyA.equals(moneyD)).toBe(false);
  });

  it('should add two money objects', () => {
    const moneyA = Money.fromCents(100, 'USD');
    const moneyB = Money.fromCents(50, 'USD');
    const result = moneyA.add(moneyB);

    expect(result.amountInCents).toBe(150);
    expect(result.currency).toBe('USD');
  });

  it('should throw when adding different currencies', () => {
    const moneyA = Money.fromCents(100, 'USD');
    const moneyB = Money.fromCents(50, 'EUR');

    expect(() => moneyA.add(moneyB)).toThrow('Cannot operate on different currencies: USD vs EUR');
  });

  it('should multiply amount correctly', () => {
    const money = Money.fromCents(100, 'USD');
    const result = money.multiply(3);

    expect(result.amountInCents).toBe(300);
    expect(result.currency).toBe('USD');
  });

  it('should determine if positive correctly', () => {
    const zero = Money.fromCents(0);
    const positive = Money.fromCents(100);

    expect(positive.isPositive()).toBe(true);
    expect(zero.isPositive()).toBe(false);
  });
});
