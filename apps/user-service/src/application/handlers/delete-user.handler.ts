import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { DeleteUserCommand } from '../commands/delete-user.command';
import { UserId } from '../../domain/value-objects/user-id.vo';
import { IUserRepository, USER_REPOSITORY } from '../../domain/ports';
import { IEventPublisher, EVENT_PUBLISHER } from '../../application/ports';
import { UserMetricsService } from '../../infrastructure/observability/user-metrics.service';
import { AuditLogService } from '../../infrastructure/observability/audit-log.service';

@Injectable()
export class DeleteUserHandler {
  private readonly logger = new Logger(DeleteUserHandler.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
    private readonly metrics: UserMetricsService,
    private readonly auditLog: AuditLogService,
  ) {}

  async execute(command: DeleteUserCommand): Promise<void> {
    const stopTimer = this.metrics.startTimer('delete_user');

    const user = await this.userRepository.findById(UserId.create(command.userId));
    if (!user) {
      throw new NotFoundException(`User ${command.userId} not found`);
    }

    user.delete();
    await this.userRepository.save(user);

    const events = user.pullDomainEvents();
    await this.eventPublisher.publishAll(events);

    this.metrics.incrementUsersDeleted();
    stopTimer();

    this.auditLog.log({
      userId: command.userId,
      action: 'USER_DELETED',
      targetId: command.userId,
    });

    this.logger.log(`User ${command.userId} soft-deleted`);
  }
}
