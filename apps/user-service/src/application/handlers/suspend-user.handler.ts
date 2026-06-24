import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { SuspendUserCommand } from '../commands/suspend-user.command';
import { UserId } from '../../domain/value-objects/user-id.vo';
import { USER_REPOSITORY } from '../../domain/ports/user-repository.port';
import type { IUserRepository } from '../../domain/ports/user-repository.port';
import { UnitOfWork } from '../../infrastructure/persistence/unit-of-work.service';
import { UserMetricsService } from '../../infrastructure/observability/user-metrics.service';
import { AuditLogService } from '../../infrastructure/observability/audit-log.service';

@Injectable()
export class SuspendUserHandler {
  constructor(
    @Inject(Logger) private readonly logger: Logger,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly metrics: UserMetricsService,
    private readonly auditLog: AuditLogService,
  ) {}

  async execute(command: SuspendUserCommand): Promise<void> {
    const stopTimer = this.metrics.startTimer('suspend_user');

    const user = await this.userRepository.findById(
      UserId.create(command.userId),
    );
    if (!user) {
      throw new NotFoundException(`User ${command.userId} not found`);
    }

    // H4: Capture previous status before transition for accurate metrics
    const previousStatus = user.status.value;
    user.suspend(command.reason);

    const events = user.pullDomainEvents();
    await this.unitOfWork.commitUserWithEvents(user, events);

    this.metrics.incrementUsersSuspended();
    this.metrics.recordStatusChange(previousStatus, 'SUSPENDED');
    stopTimer();

    this.auditLog.log({
      userId: command.userId,
      action: 'USER_SUSPENDED',
      targetId: command.userId,
      details: { reason: command.reason },
    });

    this.logger.log(`User ${command.userId} suspended: ${command.reason}`);
  }
}
