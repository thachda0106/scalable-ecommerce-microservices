import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload, Ctx, KafkaContext } from '@nestjs/microservices';
import { CommandBus } from '@nestjs/cqrs';
import { SendNotificationCommand } from '../../application/commands/send-notification.command';
import { NotificationChannel } from '../../domain/enums/notification-channel.enum';
import { NotificationPriority } from '../../domain/enums/notification-priority.enum';
import { ORDER_TOPICS } from '@ecommerce/events';

@Controller()
export class NotificationEventController {
  private readonly logger = new Logger(NotificationEventController.name);

  constructor(private readonly commandBus: CommandBus) {}

  @EventPattern('user.registered')
  async handleUserRegistered(@Payload() message: any, @Ctx() context: KafkaContext) {
    this.logger.log(`Received user.registered event for user ${message.userId}`);
    const correlationId = message.header?.correlationId || crypto.randomUUID();
    
    await this.commandBus.execute(
      new SendNotificationCommand(
        message.userId,
        NotificationChannel.EMAIL,
        'user-registration',
        { userName: message.name || 'User' },
        correlationId,
        NotificationPriority.HIGH,
        message.email,
        undefined,
        message
      )
    );
  }

  @EventPattern(ORDER_TOPICS.CREATED)
  async handleOrderCreated(@Payload() message: any, @Ctx() context: KafkaContext) {
    this.logger.log(`Received order.created event for order ${message.orderId}`);
    const correlationId = message.header?.correlationId || crypto.randomUUID();
    
    await this.commandBus.execute(
      new SendNotificationCommand(
        message.userId,
        NotificationChannel.EMAIL,
        'order-confirmation',
        { orderId: message.orderId, totalAmount: String(message.totalAmount) },
        correlationId,
        NotificationPriority.HIGH,
        message.email, // email might be missing if we don't have user context, template uses fallback
        undefined,
        message
      )
    );
  }

  @EventPattern('order.paid')
  async handleOrderPaid(@Payload() message: any, @Ctx() context: KafkaContext) {
    this.logger.log(`Received order.paid event for order ${message.orderId}`);
    const correlationId = message.header?.correlationId || crypto.randomUUID();
    
    await this.commandBus.execute(
      new SendNotificationCommand(
        message.userId,
        NotificationChannel.EMAIL,
        'payment-receipt',
        { orderId: message.orderId, amount: String(message.amount) },
        correlationId,
        NotificationPriority.NORMAL,
        message.email,
        undefined,
        message
      )
    );
  }

  @EventPattern('order.shipped')
  async handleOrderShipped(@Payload() message: any, @Ctx() context: KafkaContext) {
    this.logger.log(`Received order.shipped event for order ${message.orderId}`);
    const correlationId = message.header?.correlationId || crypto.randomUUID();
    
    await this.commandBus.execute(
      new SendNotificationCommand(
        message.userId,
        NotificationChannel.EMAIL,
        'shipping-update',
        { orderId: message.orderId, trackingNumber: message.trackingNumber || 'N/A' },
        correlationId,
        NotificationPriority.NORMAL,
        message.email,
        undefined,
        message
      )
    );
  }

  @EventPattern('cart.abandoned')
  async handleCartAbandoned(@Payload() message: any, @Ctx() context: KafkaContext) {
    this.logger.log(`Received cart.abandoned event for cart ${message.cartId}`);
    const correlationId = message.header?.correlationId || crypto.randomUUID();
    
    await this.commandBus.execute(
      new SendNotificationCommand(
        message.userId,
        NotificationChannel.EMAIL,
        'abandoned-cart',
        { cartId: message.cartId },
        correlationId,
        NotificationPriority.LOW,
        message.email,
        undefined,
        message
      )
    );
  }
}
