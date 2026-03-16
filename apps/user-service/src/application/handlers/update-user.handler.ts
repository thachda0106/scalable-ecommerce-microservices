import { Injectable, Inject, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { UpdateUserCommand } from '../commands/update-user.command';
import { UserId } from '../../domain/value-objects/user-id.vo';
import { Email } from '../../domain/value-objects/email.vo';
import { Username } from '../../domain/value-objects/username.vo';
import { USER_REPOSITORY } from '../../domain/ports/user-repository.port';
import type { IUserRepository } from '../../domain/ports/user-repository.port';
import { UnitOfWork } from '../../infrastructure/persistence/unit-of-work.service';
import { UserMetricsService } from '../../infrastructure/observability/user-metrics.service';
import { AuditLogService } from '../../infrastructure/observability/audit-log.service';

@Injectable()
export class UpdateUserHandler {
  private readonly logger = new Logger(UpdateUserHandler.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly metrics: UserMetricsService,
    private readonly auditLog: AuditLogService,
  ) {}

  async execute(command: UpdateUserCommand): Promise<void> {
    const stopTimer = this.metrics.startTimer('update_user');

    const user = await this.userRepository.findById(UserId.create(command.userId));
    if (!user) {
      throw new NotFoundException(`User ${command.userId} not found`);
    }

    // H2: Check uniqueness before updating email
    if (command.email) {
      const existingByEmail = await this.userRepository.findByEmail(Email.create(command.email));
      if (existingByEmail && existingByEmail.id.value !== command.userId) {
        throw new ConflictException(`Email '${command.email}' is already taken`);
      }
      user.updateEmail(Email.create(command.email));
      this.metrics.incrementUsersUpdated('email');
      this.auditLog.log({
        userId: command.userId,
        action: 'EMAIL_CHANGED',
        targetId: command.userId,
        details: { newEmail: command.email },
      });
    }

    // H2: Check uniqueness before updating username
    if (command.username) {
      const existingByUsername = await this.userRepository.findByUsername(Username.create(command.username));
      if (existingByUsername && existingByUsername.id.value !== command.userId) {
        throw new ConflictException(`Username '${command.username}' is already taken`);
      }
      user.updateUsername(Username.create(command.username));
      this.metrics.incrementUsersUpdated('username');
      this.auditLog.log({
        userId: command.userId,
        action: 'USERNAME_CHANGED',
        targetId: command.userId,
        details: { newUsername: command.username },
      });
    }

    const events = user.pullDomainEvents();
    await this.unitOfWork.commitUserWithEvents(user, events);

    stopTimer();
    this.logger.log(`User ${command.userId} updated`);
  }
}
