import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { UpdateUserProfileCommand } from '../commands/update-user-profile.command';
import { UserId } from '../../domain/value-objects/user-id.vo';
import { IUserRepository, USER_REPOSITORY } from '../../domain/ports';
import { IEventPublisher, EVENT_PUBLISHER } from '../../application/ports';
import { UserMetricsService } from '../../infrastructure/observability/user-metrics.service';
import { AuditLogService } from '../../infrastructure/observability/audit-log.service';

@Injectable()
export class UpdateUserProfileHandler {
  private readonly logger = new Logger(UpdateUserProfileHandler.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
    private readonly metrics: UserMetricsService,
    private readonly auditLog: AuditLogService,
  ) {}

  async execute(command: UpdateUserProfileCommand): Promise<void> {
    const stopTimer = this.metrics.startTimer('update_user_profile');

    const user = await this.userRepository.findById(UserId.create(command.userId));
    if (!user) {
      throw new NotFoundException(`User ${command.userId} not found`);
    }

    user.updateProfile({
      displayName: command.displayName,
      avatar: command.avatar,
      bio: command.bio,
      phoneNumber: command.phoneNumber,
      dateOfBirth: command.dateOfBirth,
    });

    await this.userRepository.save(user);

    const events = user.pullDomainEvents();
    await this.eventPublisher.publishAll(events);

    this.metrics.incrementUsersUpdated('profile');
    stopTimer();

    this.auditLog.log({
      userId: command.userId,
      action: 'PROFILE_UPDATED',
      targetId: command.userId,
    });

    this.logger.log(`Profile updated for user ${command.userId}`);
  }
}
