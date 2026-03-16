import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { UpdateUserCommand } from '../commands/update-user.command';
import { UserId } from '../../domain/value-objects/user-id.vo';
import { Email } from '../../domain/value-objects/email.vo';
import { Username } from '../../domain/value-objects/username.vo';
import { IUserRepository, USER_REPOSITORY } from '../../domain/ports';
import { IEventPublisher, EVENT_PUBLISHER } from '../../application/ports';
import { UserMetricsService } from '../../infrastructure/observability/user-metrics.service';
import { AuditLogService } from '../../infrastructure/observability/audit-log.service';

@Injectable()
export class UpdateUserHandler {
  private readonly logger = new Logger(UpdateUserHandler.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
    private readonly metrics: UserMetricsService,
    private readonly auditLog: AuditLogService,
  ) {}

  async execute(command: UpdateUserCommand): Promise<void> {
    const stopTimer = this.metrics.startTimer('update_user');

    const user = await this.userRepository.findById(UserId.create(command.userId));
    if (!user) {
      throw new NotFoundException(`User ${command.userId} not found`);
    }

    if (command.email) {
      user.updateEmail(Email.create(command.email));
      this.metrics.incrementUsersUpdated('email');
      this.auditLog.log({
        userId: command.userId,
        action: 'EMAIL_CHANGED',
        targetId: command.userId,
        details: { newEmail: command.email },
      });
    }

    if (command.username) {
      user.updateUsername(Username.create(command.username));
      this.metrics.incrementUsersUpdated('username');
      this.auditLog.log({
        userId: command.userId,
        action: 'USERNAME_CHANGED',
        targetId: command.userId,
        details: { newUsername: command.username },
      });
    }

    await this.userRepository.save(user);

    const events = user.pullDomainEvents();
    await this.eventPublisher.publishAll(events);

    stopTimer();
    this.logger.log(`User ${command.userId} updated`);
  }
}
