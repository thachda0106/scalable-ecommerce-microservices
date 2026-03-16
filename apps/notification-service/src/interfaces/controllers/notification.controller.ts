import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { SendNotificationDto } from '../dto/send-notification.dto';
import { SendNotificationCommand } from '../../application/commands/send-notification.command';
import { RetryNotificationCommand } from '../../application/commands/retry-notification.command';
import { GetNotificationQuery } from '../../application/queries/get-notification.query';

@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  async send(@Body() dto: SendNotificationDto) {
    const correlationId = crypto.randomUUID();
    return this.commandBus.execute(
      new SendNotificationCommand(
        dto.recipientId,
        dto.channel,
        dto.templateSlug,
        dto.variables,
        correlationId,
        dto.priority,
        dto.recipientEmail,
        dto.recipientPhone,
        dto.metadata,
      ),
    );
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.queryBus.execute(new GetNotificationQuery(id));
  }

  @Post(':id/resend')
  async resend(@Param('id') id: string) {
    return this.commandBus.execute(new RetryNotificationCommand(id));
  }
}
