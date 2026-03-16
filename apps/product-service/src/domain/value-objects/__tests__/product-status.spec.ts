import { ProductStatus, ProductStatusEnum } from '../product-status.vo';
import { InvalidProductStatusTransitionError } from '../../errors/invalid-product-status-transition.error';

describe('ProductStatus', () => {
  describe('valid transitions', () => {
    it('should allow ACTIVE → INACTIVE', () => {
      const status = ProductStatus.active();
      const next = status.transitionTo(ProductStatusEnum.INACTIVE);
      expect(next.value).toBe(ProductStatusEnum.INACTIVE);
    });

    it('should allow ACTIVE → OUT_OF_STOCK', () => {
      const status = ProductStatus.active();
      const next = status.transitionTo(ProductStatusEnum.OUT_OF_STOCK);
      expect(next.value).toBe(ProductStatusEnum.OUT_OF_STOCK);
    });

    it('should allow ACTIVE → ARCHIVED', () => {
      const status = ProductStatus.active();
      const next = status.transitionTo(ProductStatusEnum.ARCHIVED);
      expect(next.value).toBe(ProductStatusEnum.ARCHIVED);
    });

    it('should allow INACTIVE → ACTIVE', () => {
      const status = ProductStatus.create(ProductStatusEnum.INACTIVE);
      const next = status.transitionTo(ProductStatusEnum.ACTIVE);
      expect(next.value).toBe(ProductStatusEnum.ACTIVE);
    });

    it('should allow OUT_OF_STOCK → ACTIVE', () => {
      const status = ProductStatus.create(ProductStatusEnum.OUT_OF_STOCK);
      const next = status.transitionTo(ProductStatusEnum.ACTIVE);
      expect(next.value).toBe(ProductStatusEnum.ACTIVE);
    });
  });

  describe('invalid transitions', () => {
    it('should reject ARCHIVED → ACTIVE (terminal state)', () => {
      const status = ProductStatus.create(ProductStatusEnum.ARCHIVED);
      expect(() => status.transitionTo(ProductStatusEnum.ACTIVE)).toThrow(
        InvalidProductStatusTransitionError,
      );
    });

    it('should reject ARCHIVED → INACTIVE (terminal state)', () => {
      const status = ProductStatus.create(ProductStatusEnum.ARCHIVED);
      expect(() => status.transitionTo(ProductStatusEnum.INACTIVE)).toThrow(
        InvalidProductStatusTransitionError,
      );
    });
  });

  describe('canTransitionTo', () => {
    it('should return true for valid transition', () => {
      const status = ProductStatus.active();
      expect(status.canTransitionTo(ProductStatusEnum.INACTIVE)).toBe(true);
    });

    it('should return false for invalid transition', () => {
      const status = ProductStatus.create(ProductStatusEnum.ARCHIVED);
      expect(status.canTransitionTo(ProductStatusEnum.ACTIVE)).toBe(false);
    });
  });

  describe('isTerminal', () => {
    it('should return true for ARCHIVED', () => {
      const status = ProductStatus.create(ProductStatusEnum.ARCHIVED);
      expect(status.isTerminal()).toBe(true);
    });

    it('should return false for ACTIVE', () => {
      expect(ProductStatus.active().isTerminal()).toBe(false);
    });
  });

  describe('equals', () => {
    it('should return true for same status', () => {
      const a = ProductStatus.active();
      const b = ProductStatus.active();
      expect(a.equals(b)).toBe(true);
    });

    it('should return false for different status', () => {
      const a = ProductStatus.active();
      const b = ProductStatus.create(ProductStatusEnum.INACTIVE);
      expect(a.equals(b)).toBe(false);
    });
  });
});
