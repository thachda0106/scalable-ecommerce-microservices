import { Injectable, Inject, Logger, ConflictException } from '@nestjs/common';
import { CreateUserCommand } from '../commands/create-user.command';
import { User } from '../../domain/entities/user.entity';
import { Email } from '../../domain/value-objects/email.vo';
import { Username } from '../../domain/value-objects/username.vo';
import { USER_REPOSITORY } from '../../domain/ports/user-repository.port';
import type { IUserRepository } from '../../domain/ports/user-repository.port';
import { EVENT_PUBLISHER } from '../../application/ports/event-publisher.port';
import type { IEventPublisher } from '../../application/ports/event-publisher.port';
import { UserMetricsService } from '../../infrastructure/observability/user-metrics.service';
import { AuditLogService } from '../../infrastructure/observability/audit-log.service';

@Injectable()
export class CreateUserHandler {
  private readonly logger = new Logger(CreateUserHandler.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
    private readonly metrics: UserMetricsService,
    private readonly auditLog: AuditLogService,
  ) {}

  async execute(command: CreateUserCommand): Promise<string> {
    const stopTimer = this.metrics.startTimer('create_user');

    // Check email uniqueness
    const existingByEmail = await this.userRepository.findByEmail(
      Email.create(command.email),
    );
    if (existingByEmail) {
      throw new ConflictException(`User with email '${command.email}' already exists`);
    }

    // Check username uniqueness
    const existingByUsername = await this.userRepository.findByUsername(
      Username.create(command.username),
    );
    if (existingByUsername) {
      throw new ConflictException(`User with username '${command.username}' already exists`);
    }

    const user = User.create({
      email: command.email,
      username: command.username,
    });

    await this.userRepository.save(user);

    const events = user.pullDomainEvents();
    await this.eventPublisher.publishAll(events);

    this.metrics.incrementUsersCreated();
    stopTimer();

    this.auditLog.log({
      userId: user.id.value,
      action: 'USER_CREATED',
      targetId: user.id.value,
      details: { email: command.email, username: command.username },
    });

    this.logger.log(`User ${user.id.value} created with email ${command.email}`);
    return user.id.value;
  }
}
