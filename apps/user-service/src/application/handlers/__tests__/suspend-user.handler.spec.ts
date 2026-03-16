import { SuspendUserHandler } from '../suspend-user.handler';
import { SuspendUserCommand } from '../../commands/suspend-user.command';
import type { IUserRepository } from '../../../domain/ports/user-repository.port';
import type { IEventPublisher } from '../../../application/ports/event-publisher.port';
import type { UserMetricsService } from '../../../infrastructure/observability/user-metrics.service';
import type { AuditLogService } from '../../../infrastructure/observability/audit-log.service';
import { NotFoundException } from '@nestjs/common';
import { User } from '../../../domain/entities/user.entity';

describe('SuspendUserHandler', () => {
  let handler: SuspendUserHandler;
  let userRepository: jest.Mocked<IUserRepository>;
  let eventPublisher: jest.Mocked<IEventPublisher>;
  let metrics: jest.Mocked<UserMetricsService>;
  let auditLog: jest.Mocked<AuditLogService>;

  beforeEach(() => {
    userRepository = {
      save: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByUsername: jest.fn(),
      findAll: jest.fn(),
      delete: jest.fn(),
    };

    eventPublisher = { publish: jest.fn(), publishAll: jest.fn() };
    metrics = {
      incrementUsersCreated: jest.fn(), incrementUsersUpdated: jest.fn(),
      incrementUsersDeleted: jest.fn(), incrementUsersSuspended: jest.fn(),
      incrementUsersReactivated: jest.fn(), recordStatusChange: jest.fn(),
      startTimer: jest.fn().mockReturnValue(jest.fn()),
      setActiveUsers: jest.fn(), getMetrics: jest.fn(),
    } as any;
    auditLog = { log: jest.fn() } as any;

    handler = new SuspendUserHandler(userRepository, eventPublisher, metrics, auditLog);
  });

  it('should suspend user, save, and publish events', async () => {
    const user = User.create({ email: 'test@example.com', username: 'testuser' });
    user.pullDomainEvents();
    userRepository.findById.mockResolvedValue(user);

    await handler.execute(new SuspendUserCommand(user.id.value, 'policy violation'));

    expect(userRepository.save).toHaveBeenCalledTimes(1);
    expect(eventPublisher.publishAll).toHaveBeenCalledTimes(1);
    expect(metrics.incrementUsersSuspended).toHaveBeenCalledTimes(1);
    expect(auditLog.log).toHaveBeenCalledTimes(1);
  });

  it('should throw NotFoundException when user not found', async () => {
    userRepository.findById.mockResolvedValue(null);

    await expect(
      handler.execute(new SuspendUserCommand('nonexistent', 'reason')),
    ).rejects.toThrow(NotFoundException);
  });
});
