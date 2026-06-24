import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { DeleteUserCommand } from '../commands/delete-user.command';
import { UserId } from '../../domain/value-objects/user-id.vo';
import { USER_REPOSITORY } from '../../domain/ports/user-repository.port';
import type { IUserRepository } from '../../domain/ports/user-repository.port';
import { UnitOfWork } from '../../infrastructure/persistence/unit-of-work.service';
import { UserMetricsService } from '../../infrastructure/observability/user-metrics.service';
import { AuditLogService } from '../../infrastructure/observability/audit-log.service';

@Injectable()
export class DeleteUserHandler {
  constructor(
    @Inject(Logger) private readonly logger: Logger,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly metrics: UserMetricsService,
    private readonly auditLog: AuditLogService,
  ) {}

  async execute(command: DeleteUserCommand): Promise<void> {
    const stopTimer = this.metrics.startTimer('delete_user');

    const user = await this.userRepository.findById(
      UserId.create(command.userId),
    );
    if (!user) {
      throw new NotFoundException(`User ${command.userId} not found`);
    }

    const previousStatus = user.status.value;
    user.delete();

    const events = user.pullDomainEvents();
    await this.unitOfWork.commitUserWithEvents(user, events);

    this.metrics.incrementUsersDeleted();
    this.metrics.recordStatusChange(previousStatus, 'DELETED');
    stopTimer();

    this.auditLog.log({
      userId: command.userId,
      action: 'USER_DELETED',
      targetId: command.userId,
    });

    this.logger.log(`User ${command.userId} soft-deleted`);
  }
}
