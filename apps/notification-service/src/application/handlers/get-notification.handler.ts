import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import { GetNotificationQuery } from '../queries/get-notification.query';
import {
  NOTIFICATION_REPOSITORY,
  INotificationRepository,
} from '../../domain/ports/notification-repository.port';

@QueryHandler(GetNotificationQuery)
export class GetNotificationHandler
  implements IQueryHandler<GetNotificationQuery>
{
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notificationRepo: INotificationRepository,
  ) {}

  async execute(query: GetNotificationQuery) {
    const notification = await this.notificationRepo.findById(
      query.notificationId,
    );
    if (!notification) {
      throw new NotFoundException(
        `Notification ${query.notificationId} not found`,
      );
    }
    return notification.toJSON();
  }
}
