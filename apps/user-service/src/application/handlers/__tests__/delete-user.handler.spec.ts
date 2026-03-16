import { DeleteUserHandler } from '../delete-user.handler';
import { DeleteUserCommand } from '../../commands/delete-user.command';
import type { IUserRepository } from '../../../domain/ports/user-repository.port';
import type { UnitOfWork } from '../../../infrastructure/persistence/unit-of-work.service';
import type { UserMetricsService } from '../../../infrastructure/observability/user-metrics.service';
import type { AuditLogService } from '../../../infrastructure/observability/audit-log.service';
import { NotFoundException } from '@nestjs/common';
import { User } from '../../../domain/entities/user.entity';

describe('DeleteUserHandler', () => {
  let handler: DeleteUserHandler;
  let userRepository: jest.Mocked<IUserRepository>;
  let unitOfWork: jest.Mocked<UnitOfWork>;
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

    unitOfWork = { commitUserWithEvents: jest.fn() } as any;
    metrics = {
      incrementUsersCreated: jest.fn(), incrementUsersUpdated: jest.fn(),
      incrementUsersDeleted: jest.fn(), incrementUsersSuspended: jest.fn(),
      incrementUsersReactivated: jest.fn(), recordStatusChange: jest.fn(),
      startTimer: jest.fn().mockReturnValue(jest.fn()),
      setActiveUsers: jest.fn(), getMetrics: jest.fn(),
    } as any;
    auditLog = { log: jest.fn() } as any;

    handler = new DeleteUserHandler(userRepository, unitOfWork, metrics, auditLog);
  });

  it('should soft-delete user and commit via UnitOfWork', async () => {
    const user = User.create({ email: 'test@example.com', username: 'testuser' });
    user.pullDomainEvents();
    userRepository.findById.mockResolvedValue(user);

    await handler.execute(new DeleteUserCommand(user.id.value));

    expect(unitOfWork.commitUserWithEvents).toHaveBeenCalledTimes(1);
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
