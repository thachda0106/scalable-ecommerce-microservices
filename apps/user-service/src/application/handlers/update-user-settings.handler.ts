import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { UpdateUserSettingsCommand } from '../commands/update-user-settings.command';
import { UserId } from '../../domain/value-objects/user-id.vo';
import { USER_REPOSITORY } from '../../domain/ports/user-repository.port';
import type { IUserRepository } from '../../domain/ports/user-repository.port';
import { UnitOfWork } from '../../infrastructure/persistence/unit-of-work.service';
import { UserMetricsService } from '../../infrastructure/observability/user-metrics.service';
import { AuditLogService } from '../../infrastructure/observability/audit-log.service';

@Injectable()
export class UpdateUserSettingsHandler {
  constructor(
    @Inject(Logger) private readonly logger: Logger,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly metrics: UserMetricsService,
    private readonly auditLog: AuditLogService,
  ) {}

  async execute(command: UpdateUserSettingsCommand): Promise<void> {
    const stopTimer = this.metrics.startTimer('update_user_settings');

    const user = await this.userRepository.findById(
      UserId.create(command.userId),
    );
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

    const events = user.pullDomainEvents();
    await this.unitOfWork.commitUserWithEvents(user, events);

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
