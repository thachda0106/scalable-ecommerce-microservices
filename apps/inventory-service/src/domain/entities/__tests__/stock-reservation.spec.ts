import { StockReservation } from '../stock-reservation';
import { ReservationStatus } from '../../value-objects/reservation-status.vo';

describe('StockReservation', () => {
  const createReservation = () =>
    StockReservation.create({
      productId: '550e8400-e29b-41d4-a716-446655440000',
      referenceId: 'cart-123',
      referenceType: 'CART',
      quantity: 5,
      ttlMinutes: 15,
      idempotencyKey: 'reserve-cart-123-prod-1',
    });

  it('should create with ACTIVE status', () => {
    const res = createReservation();
    expect(res.status).toBe(ReservationStatus.ACTIVE);
    expect(res.isActive()).toBe(true);
  });

  it('should set expiresAt to now + ttlMinutes', () => {
    const before = Date.now();
    const res = createReservation();
    const expectedExpiry = before + 15 * 60 * 1000;
    expect(res.expiresAt.getTime()).toBeGreaterThanOrEqual(
      expectedExpiry - 1000,
    );
    expect(res.expiresAt.getTime()).toBeLessThanOrEqual(
      expectedExpiry + 1000,
    );
  });

  describe('confirm()', () => {
    it('should transition to CONFIRMED', () => {
      const res = createReservation();
      res.confirm();
      expect(res.status).toBe(ReservationStatus.CONFIRMED);
    });

    it('should throw if not ACTIVE', () => {
      const res = createReservation();
      res.confirm();
      expect(() => res.confirm()).toThrow();
    });
  });

  describe('release()', () => {
    it('should transition to RELEASED', () => {
      const res = createReservation();
      res.release();
      expect(res.status).toBe(ReservationStatus.RELEASED);
    });

    it('should throw if not ACTIVE', () => {
      const res = createReservation();
      res.release();
      expect(() => res.release()).toThrow();
    });
  });

  describe('expire()', () => {
    it('should transition to EXPIRED', () => {
      const res = createReservation();
      res.expire();
      expect(res.status).toBe(ReservationStatus.EXPIRED);
    });

    it('should throw if not ACTIVE', () => {
      const res = createReservation();
      res.confirm();
      expect(() => res.expire()).toThrow();
    });
  });

  describe('isExpired()', () => {
    it('should return false for non-expired ACTIVE reservation', () => {
      const res = createReservation();
      expect(res.isExpired()).toBe(false);
    });
  });
});
