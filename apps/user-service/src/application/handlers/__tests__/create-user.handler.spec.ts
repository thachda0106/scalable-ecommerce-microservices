import { CreateUserHandler } from '../create-user.handler';
import { CreateUserCommand } from '../../commands/create-user.command';
import type { IUserRepository } from '../../../domain/ports/user-repository.port';
import type { IEventPublisher } from '../../../application/ports/event-publisher.port';
import type { UserMetricsService } from '../../../infrastructure/observability/user-metrics.service';
import type { AuditLogService } from '../../../infrastructure/observability/audit-log.service';
import { ConflictException } from '@nestjs/common';
import { User } from '../../../domain/entities/user.entity';

describe('CreateUserHandler', () => {
  let handler: CreateUserHandler;
  let userRepository: jest.Mocked<IUserRepository>;
  let eventPublisher: jest.Mocked<IEventPublisher>;
  let metrics: jest.Mocked<UserMetricsService>;
  let auditLog: jest.Mocked<AuditLogService>;

  beforeEach(() => {
    userRepository = {
      save: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn().mockResolvedValue(null),
      findByUsername: jest.fn().mockResolvedValue(null),
      findAll: jest.fn(),
      delete: jest.fn(),
    };

    eventPublisher = {
      publish: jest.fn(),
      publishAll: jest.fn(),
    };

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
    } as any;

    auditLog = {
      log: jest.fn(),
    } as any;

    handler = new CreateUserHandler(userRepository, eventPublisher, metrics, auditLog);
  });

  it('should create user, save, publish events, and return userId', async () => {
    const command = new CreateUserCommand('test@example.com', 'testuser');

    const userId = await handler.execute(command);

    expect(userId).toBeDefined();
    expect(userRepository.save).toHaveBeenCalledTimes(1);
    expect(eventPublisher.publishAll).toHaveBeenCalledTimes(1);
    expect(metrics.incrementUsersCreated).toHaveBeenCalledTimes(1);
    expect(metrics.startTimer).toHaveBeenCalledWith('create_user');
    expect(auditLog.log).toHaveBeenCalledTimes(1);
  });

  it('should throw ConflictException when email already exists', async () => {
    userRepository.findByEmail.mockResolvedValue({} as User);
    const command = new CreateUserCommand('taken@example.com', 'testuser');

    await expect(handler.execute(command)).rejects.toThrow(ConflictException);
    expect(userRepository.save).not.toHaveBeenCalled();
  });

  it('should throw ConflictException when username already exists', async () => {
    userRepository.findByUsername.mockResolvedValue({} as User);
    const command = new CreateUserCommand('test@example.com', 'taken_user');

    await expect(handler.execute(command)).rejects.toThrow(ConflictException);
    expect(userRepository.save).not.toHaveBeenCalled();
  });
});
