import { User } from '../user.entity';
import { UserStatusEnum } from '../../value-objects/user-status.vo';
import { InvalidUserStatusTransitionError } from '../../errors/invalid-user-status-transition.error';
import { InvalidUserOperationError } from '../../errors/invalid-user-operation.error';

describe('User', () => {
  describe('create', () => {
    it('should create a new user with ACTIVE status', () => {
      const user = User.create({ email: 'test@example.com', username: 'testuser' });

      expect(user.id).toBeDefined();
      expect(user.email.value).toBe('test@example.com');
      expect(user.username.value).toBe('testuser');
      expect(user.status.value).toBe(UserStatusEnum.ACTIVE);
      expect(user.version).toBe(1);
    });

    it('should create default profile and settings', () => {
      const user = User.create({ email: 'test@example.com', username: 'testuser' });

      expect(user.profile.displayName).toBeNull();
      expect(user.settings.emailNotifications).toBe(true);
      expect(user.settings.smsNotifications).toBe(false);
      expect(user.settings.language).toBe('en');
    });

    it('should raise UserCreatedEvent', () => {
      const user = User.create({ email: 'test@example.com', username: 'testuser' });
      const events = user.pullDomainEvents();

      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('user.created');
    });
  });

  describe('pullDomainEvents', () => {
    it('should return events and clear the list', () => {
      const user = User.create({ email: 'test@example.com', username: 'testuser' });
      const events1 = user.pullDomainEvents();
      const events2 = user.pullDomainEvents();

      expect(events1).toHaveLength(1);
      expect(events2).toHaveLength(0);
    });
  });

  describe('suspend', () => {
    it('should transition ACTIVE → SUSPENDED and raise UserSuspendedEvent', () => {
      const user = User.create({ email: 'test@example.com', username: 'testuser' });
      user.pullDomainEvents(); // clear creation event

      user.suspend('policy violation');
      expect(user.status.value).toBe(UserStatusEnum.SUSPENDED);

      const events = user.pullDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('user.suspended');
    });

    it('should throw on SUSPENDED → SUSPENDED', () => {
      const user = User.create({ email: 'test@example.com', username: 'testuser' });
      user.suspend('reason');

      expect(() => user.suspend('again')).toThrow(InvalidUserStatusTransitionError);
    });
  });

  describe('reactivate', () => {
    it('should transition SUSPENDED → ACTIVE and raise UserReactivatedEvent', () => {
      const user = User.create({ email: 'test@example.com', username: 'testuser' });
      user.suspend('test');
      user.pullDomainEvents();

      user.reactivate();
      expect(user.status.value).toBe(UserStatusEnum.ACTIVE);

      const events = user.pullDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('user.reactivated');
    });

    it('should throw on ACTIVE → ACTIVE (reactivate)', () => {
      const user = User.create({ email: 'test@example.com', username: 'testuser' });

      expect(() => user.reactivate()).toThrow(InvalidUserStatusTransitionError);
    });
  });

  describe('delete', () => {
    it('should transition to DELETED and raise UserDeletedEvent', () => {
      const user = User.create({ email: 'test@example.com', username: 'testuser' });
      user.pullDomainEvents();

      user.delete();
      expect(user.status.value).toBe(UserStatusEnum.DELETED);

      const events = user.pullDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('user.deleted');
    });

    it('should throw on any operation after DELETED', () => {
      const user = User.create({ email: 'test@example.com', username: 'testuser' });
      user.delete();

      expect(() => user.suspend('reason')).toThrow(InvalidUserStatusTransitionError);
      expect(() => user.reactivate()).toThrow(InvalidUserStatusTransitionError);
    });
  });

  describe('updateProfile', () => {
    it('should update profile and raise UserUpdatedEvent', () => {
      const user = User.create({ email: 'test@example.com', username: 'testuser' });
      user.pullDomainEvents();

      user.updateProfile({ displayName: 'Test User', bio: 'Hello' });

      expect(user.profile.displayName).toBe('Test User');
      expect(user.profile.bio).toBe('Hello');

      const events = user.pullDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('user.updated');
    });

    it('should throw on deleted user', () => {
      const user = User.create({ email: 'test@example.com', username: 'testuser' });
      user.delete();

      expect(() => user.updateProfile({ displayName: 'x' })).toThrow(InvalidUserOperationError);
    });
  });

  describe('updateSettings', () => {
    it('should update settings and raise UserUpdatedEvent', () => {
      const user = User.create({ email: 'test@example.com', username: 'testuser' });
      user.pullDomainEvents();

      user.updateSettings({ language: 'vi', smsNotifications: true });

      expect(user.settings.language).toBe('vi');
      expect(user.settings.smsNotifications).toBe(true);

      const events = user.pullDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('user.updated');
    });
  });
});
