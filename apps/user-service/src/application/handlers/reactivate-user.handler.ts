import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { ReactivateUserCommand } from '../commands/reactivate-user.command';
import { UserId } from '../../domain/value-objects/user-id.vo';
import { USER_REPOSITORY } from '../../domain/ports/user-repository.port';
import type { IUserRepository } from '../../domain/ports/user-repository.port';
import { UnitOfWork } from '../../infrastructure/persistence/unit-of-work.service';
import { UserMetricsService } from '../../infrastructure/observability/user-metrics.service';
import { AuditLogService } from '../../infrastructure/observability/audit-log.service';

@Injectable()
export class ReactivateUserHandler {
  private readonly logger = new Logger(ReactivateUserHandler.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly metrics: UserMetricsService,
    private readonly auditLog: AuditLogService,
  ) {}

  async execute(command: ReactivateUserCommand): Promise<void> {
    const stopTimer = this.metrics.startTimer('reactivate_user');

    const user = await this.userRepository.findById(
      UserId.create(command.userId),
    );
    if (!user) {
      throw new NotFoundException(`User ${command.userId} not found`);
    }

    // H4: Capture previous status before transition for accurate metrics
    const previousStatus = user.status.value;
    user.reactivate();

    const events = user.pullDomainEvents();
    await this.unitOfWork.commitUserWithEvents(user, events);

    this.metrics.incrementUsersReactivated();
    this.metrics.recordStatusChange(previousStatus, 'ACTIVE');
    stopTimer();

    this.auditLog.log({
      userId: command.userId,
      action: 'USER_REACTIVATED',
      targetId: command.userId,
    });

    this.logger.log(`User ${command.userId} reactivated`);
  }
}
