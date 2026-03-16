import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { UpdateUserSettingsCommand } from '../commands/update-user-settings.command';
import { UserId } from '../../domain/value-objects/user-id.vo';
import { IUserRepository, USER_REPOSITORY } from '../../domain/ports';
import { IEventPublisher, EVENT_PUBLISHER } from '../../application/ports';
import { UserMetricsService } from '../../infrastructure/observability/user-metrics.service';
import { AuditLogService } from '../../infrastructure/observability/audit-log.service';

@Injectable()
export class UpdateUserSettingsHandler {
  private readonly logger = new Logger(UpdateUserSettingsHandler.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
    private readonly metrics: UserMetricsService,
    private readonly auditLog: AuditLogService,
  ) {}

  async execute(command: UpdateUserSettingsCommand): Promise<void> {
    const stopTimer = this.metrics.startTimer('update_user_settings');

    const user = await this.userRepository.findById(UserId.create(command.userId));
    if (!user) {
      throw new NotFoundException(`User ${command.userId} not found`);
    }

    user.updateSettings({
      emailNotifications: command.emailNotifications,
      pushNotifications: command.pushNotifications,
      smsNotifications: command.smsNotifications,
      language: command.language,
      timezone: command.timezone,
    });

    await this.userRepository.save(user);

    const events = user.pullDomainEvents();
    await this.eventPublisher.publishAll(events);

    this.metrics.incrementUsersUpdated('settings');
    stopTimer();

    this.auditLog.log({
      userId: command.userId,
      action: 'SETTINGS_UPDATED',
      targetId: command.userId,
    });

    this.logger.log(`Settings updated for user ${command.userId}`);
  }
}
