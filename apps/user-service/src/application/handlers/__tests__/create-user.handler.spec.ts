/* eslint-disable @typescript-eslint/unbound-method */
import { CreateUserHandler } from '../create-user.handler';
import { CreateUserCommand } from '../../commands/create-user.command';
import type { IUserRepository } from '../../../domain/ports/user-repository.port';
import type { UnitOfWork } from '../../../infrastructure/persistence/unit-of-work.service';
import type { UserMetricsService } from '../../../infrastructure/observability/user-metrics.service';
import type { AuditLogService } from '../../../infrastructure/observability/audit-log.service';
import { ConflictException } from '@nestjs/common';
import { User } from '../../../domain/entities/user.entity';
import type { Logger } from '@ecommerce/core';

describe('CreateUserHandler', () => {
  let handler: CreateUserHandler;
  let logger: jest.Mocked<Logger>;
  let userRepository: jest.Mocked<IUserRepository>;
  let unitOfWork: jest.Mocked<UnitOfWork>;
  let metrics: jest.Mocked<UserMetricsService>;
  let auditLog: jest.Mocked<AuditLogService>;

  beforeEach(() => {
    logger = { log: jest.fn() } as unknown as jest.Mocked<Logger>;

    userRepository = {
      save: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn().mockResolvedValue(null),
      findByUsername: jest.fn().mockResolvedValue(null),
      findAll: jest.fn(),
      delete: jest.fn(),
    };

    unitOfWork = {
      commitUserWithEvents: jest.fn(),
    } as unknown as jest.Mocked<UnitOfWork>;

    metrics = {
      incrementUsersCreated: jest.fn(),
      incrementUsersUpdated: jest.fn(),
      incrementUsersDeleted: jest.fn(),
      incrementUsersSuspended: jest.fn(),
      incrementUsersReactivated: jest.fn(),
      recordStatusChange: jest.fn(),
      startTimer: jest.fn().mockReturnValue(jest.fn()),
      setActiveUsers: jest.fn(),
      getMetrics: jest.fn(),
    } as unknown as jest.Mocked<UserMetricsService>;

    auditLog = {
      log: jest.fn(),
    } as unknown as jest.Mocked<AuditLogService>;

    handler = new CreateUserHandler(
      logger,
      userRepository,
      unitOfWork,
      metrics,
      auditLog,
    );
  });

  it('should create user, commit via UnitOfWork, and return userId', async () => {
    const command = new CreateUserCommand('test@example.com', 'testuser');

    const userId = await handler.execute(command);

    expect(userId).toBeDefined();
    expect(unitOfWork.commitUserWithEvents).toHaveBeenCalledTimes(1);
    expect(metrics.incrementUsersCreated).toHaveBeenCalledTimes(1);
    expect(metrics.startTimer).toHaveBeenCalledWith('create_user');
    expect(auditLog.log).toHaveBeenCalledTimes(1);
  });

  it('should throw ConflictException when email already exists', async () => {
    userRepository.findByEmail.mockResolvedValue({} as User);
    const command = new CreateUserCommand('taken@example.com', 'testuser');

    await expect(handler.execute(command)).rejects.toThrow(ConflictException);
    expect(unitOfWork.commitUserWithEvents).not.toHaveBeenCalled();
  });

  it('should throw ConflictException when username already exists', async () => {
    userRepository.findByUsername.mockResolvedValue({} as User);
    const command = new CreateUserCommand('test@example.com', 'taken_user');

    await expect(handler.execute(command)).rejects.toThrow(ConflictException);
    expect(unitOfWork.commitUserWithEvents).not.toHaveBeenCalled();
  });
});
