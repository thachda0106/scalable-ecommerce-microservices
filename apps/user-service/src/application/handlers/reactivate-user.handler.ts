import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { ReactivateUserCommand } from '../commands/reactivate-user.command';
import { UserId } from '../../domain/value-objects/user-id.vo';
import { IUserRepository, USER_REPOSITORY } from '../../domain/ports';
import { IEventPublisher, EVENT_PUBLISHER } from '../../application/ports';
import { UserMetricsService } from '../../infrastructure/observability/user-metrics.service';
import { AuditLogService } from '../../infrastructure/observability/audit-log.service';

@Injectable()
export class ReactivateUserHandler {
  private readonly logger = new Logger(ReactivateUserHandler.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
    private readonly metrics: UserMetricsService,
    private readonly auditLog: AuditLogService,
  ) {}

  async execute(command: ReactivateUserCommand): Promise<void> {
    const stopTimer = this.metrics.startTimer('reactivate_user');

    const user = await this.userRepository.findById(UserId.create(command.userId));
    if (!user) {
      throw new NotFoundException(`User ${command.userId} not found`);
    }

    user.reactivate();
    await this.userRepository.save(user);

    const events = user.pullDomainEvents();
    await this.eventPublisher.publishAll(events);

    this.metrics.incrementUsersReactivated();
    this.metrics.recordStatusChange('SUSPENDED', 'ACTIVE');
    stopTimer();

    this.auditLog.log({
      userId: command.userId,
      action: 'USER_REACTIVATED',
      targetId: command.userId,
    });

    this.logger.log(`User ${command.userId} reactivated`);
  }
}
