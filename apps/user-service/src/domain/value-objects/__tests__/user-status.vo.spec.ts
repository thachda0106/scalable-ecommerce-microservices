import { UserStatus, UserStatusEnum } from '../user-status.vo';
import { InvalidUserStatusTransitionError } from '../../errors/invalid-user-status-transition.error';

describe('UserStatus', () => {
  describe('create', () => {
    it('should create with given status', () => {
      const status = UserStatus.create(UserStatusEnum.ACTIVE);
      expect(status.value).toBe(UserStatusEnum.ACTIVE);
    });
  });

  describe('active factory', () => {
    it('should create ACTIVE status', () => {
      const status = UserStatus.active();
      expect(status.value).toBe(UserStatusEnum.ACTIVE);
    });
  });

  describe('transitions', () => {
    it('ACTIVE can transition to SUSPENDED', () => {
      const status = UserStatus.active();
      expect(status.canTransitionTo(UserStatusEnum.SUSPENDED)).toBe(true);
    });

    it('ACTIVE can transition to DELETED', () => {
      const status = UserStatus.active();
      expect(status.canTransitionTo(UserStatusEnum.DELETED)).toBe(true);
    });

    it('SUSPENDED can transition to ACTIVE', () => {
      const status = UserStatus.create(UserStatusEnum.SUSPENDED);
      expect(status.canTransitionTo(UserStatusEnum.ACTIVE)).toBe(true);
    });

    it('SUSPENDED can transition to DELETED', () => {
      const status = UserStatus.create(UserStatusEnum.SUSPENDED);
      expect(status.canTransitionTo(UserStatusEnum.DELETED)).toBe(true);
    });

    it('DELETED is terminal (no transitions)', () => {
      const status = UserStatus.create(UserStatusEnum.DELETED);
      expect(status.canTransitionTo(UserStatusEnum.ACTIVE)).toBe(false);
      expect(status.canTransitionTo(UserStatusEnum.SUSPENDED)).toBe(false);
      expect(status.isTerminal()).toBe(true);
    });

    it('should throw on invalid transition', () => {
      const status = UserStatus.create(UserStatusEnum.DELETED);
      expect(() => status.transitionTo(UserStatusEnum.ACTIVE)).toThrow(
        InvalidUserStatusTransitionError,
      );
    });

    it('transitionTo returns new UserStatus', () => {
      const active = UserStatus.active();
      const suspended = active.transitionTo(UserStatusEnum.SUSPENDED);
      expect(suspended.value).toBe(UserStatusEnum.SUSPENDED);
      expect(active.value).toBe(UserStatusEnum.ACTIVE); // original unchanged
    });
  });

  describe('equals', () => {
    it('returns true for same status', () => {
      const a = UserStatus.active();
      const b = UserStatus.active();
      expect(a.equals(b)).toBe(true);
    });

    it('returns false for different status', () => {
      const a = UserStatus.active();
      const b = UserStatus.create(UserStatusEnum.SUSPENDED);
      expect(a.equals(b)).toBe(false);
    });
  });
});
