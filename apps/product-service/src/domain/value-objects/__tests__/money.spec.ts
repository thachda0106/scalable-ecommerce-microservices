import { Money } from '../money.vo';

describe('Money', () => {
  describe('fromDecimal', () => {
    it('should store decimal as cents', () => {
      const money = Money.fromDecimal(10.50);
      expect(money.amountInCents).toBe(1050);
    });

    it('should default to USD', () => {
      const money = Money.fromDecimal(5);
      expect(money.currency).toBe('USD');
    });
  });

  describe('fromCents', () => {
    it('should create from integer cents', () => {
      const money = Money.fromCents(999, 'EUR');
      expect(money.amountInCents).toBe(999);
      expect(money.currency).toBe('EUR');
    });
  });

  describe('toDecimal', () => {
    it('should return correct decimal', () => {
      const money = Money.fromCents(2999);
      expect(money.toDecimal()).toBe(29.99);
    });
  });

  describe('add', () => {
    it('should add two Money values', () => {
      const a = Money.fromDecimal(10);
      const b = Money.fromDecimal(5.50);
      const result = a.add(b);
      expect(result.toDecimal()).toBe(15.50);
    });

    it('should throw when adding different currencies', () => {
      const usd = Money.fromDecimal(10, 'USD');
      const eur = Money.fromDecimal(5, 'EUR');
      expect(() => usd.add(eur)).toThrow();
    });
  });

  describe('multiply', () => {
    it('should scale correctly', () => {
      const money = Money.fromDecimal(10);
      const result = money.multiply(3);
      expect(result.toDecimal()).toBe(30);
    });
  });

  describe('zero', () => {
    it('should create zero amount', () => {
      const money = Money.zero();
      expect(money.amountInCents).toBe(0);
      expect(money.isZero()).toBe(true);
    });
  });

  describe('isPositive', () => {
    it('should return true for positive amount', () => {
      expect(Money.fromDecimal(1).isPositive()).toBe(true);
    });

    it('should return false for zero', () => {
      expect(Money.zero().isPositive()).toBe(false);
    });
  });

  describe('equals', () => {
    it('should compare correctly', () => {
      const a = Money.fromDecimal(10, 'USD');
      const b = Money.fromDecimal(10, 'USD');
      expect(a.equals(b)).toBe(true);
    });

    it('should return false for different amounts', () => {
      const a = Money.fromDecimal(10, 'USD');
      const b = Money.fromDecimal(20, 'USD');
      expect(a.equals(b)).toBe(false);
    });
  });
});
