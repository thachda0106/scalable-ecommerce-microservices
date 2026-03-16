import { DeleteUserHandler } from '../delete-user.handler';
import { DeleteUserCommand } from '../../commands/delete-user.command';
import type { IUserRepository } from '../../../domain/ports/user-repository.port';
import type { IEventPublisher } from '../../../application/ports/event-publisher.port';
import type { UserMetricsService } from '../../../infrastructure/observability/user-metrics.service';
import type { AuditLogService } from '../../../infrastructure/observability/audit-log.service';
import { NotFoundException } from '@nestjs/common';
import { User } from '../../../domain/entities/user.entity';

describe('DeleteUserHandler', () => {
  let handler: DeleteUserHandler;
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

    handler = new DeleteUserHandler(userRepository, eventPublisher, metrics, auditLog);
  });

  it('should soft-delete user, save, and publish events', async () => {
    const user = User.create({ email: 'test@example.com', username: 'testuser' });
    user.pullDomainEvents();
    userRepository.findById.mockResolvedValue(user);

    await handler.execute(new DeleteUserCommand(user.id.value));

    expect(userRepository.save).toHaveBeenCalledTimes(1);
    expect(eventPublisher.publishAll).toHaveBeenCalledTimes(1);
    expect(metrics.incrementUsersDeleted).toHaveBeenCalledTimes(1);
    expect(auditLog.log).toHaveBeenCalledTimes(1);
  });

  it('should throw NotFoundException when user not found', async () => {
    userRepository.findById.mockResolvedValue(null);

    await expect(
      handler.execute(new DeleteUserCommand('nonexistent')),
    ).rejects.toThrow(NotFoundException);
  });
});
