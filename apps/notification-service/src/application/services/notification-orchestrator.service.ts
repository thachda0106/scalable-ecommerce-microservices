import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { CommandBus } from '@nestjs/cqrs';
import { SendNotificationCommand } from '../commands/send-notification.command';
import { NotificationChannel } from '../../domain/enums/notification-channel.enum';
import { NotificationPriority } from '../../domain/enums/notification-priority.enum';

/**
 * NotificationOrchestrator — the central mapping service.
 *
 * Maps external domain events (from Kafka) to SendNotificationCommand instances.
 * This is the ONLY place that knows the mapping between events and notifications.
 * Kafka consumers just parse events and call the appropriate method here.
 */
@Injectable()
export class NotificationOrchestrator {

  constructor(
    @Inject(Logger) private readonly logger: Logger,
    private readonly commandBus: CommandBus,
  ) {}

  /**
   * Handles user registration event.
   * Sends a welcome email to the new user.
   *
   * Note: auth-service only provides userId + email, no userName.
   */
  async handleUserRegistered(payload: {
    userId: string;
    email: string;
    provider?: string;
  }) {
    const correlationId = `user-registered-${payload.userId}`;

    this.logger.log(
      `Processing UserRegistered for user ${payload.userId} (${payload.email})`,
    );

    return this.commandBus.execute(
      new SendNotificationCommand(
        payload.userId,
        NotificationChannel.EMAIL,
        'welcome-email',
        { email: payload.email },
        correlationId,
        NotificationPriority.NORMAL,
        payload.email,
      ),
    );
  }

  /**
   * Handles order creation event.
   * Sends an order confirmation email.
   *
   * Note: Order events have orderId, userId, totalAmount — but no email.
   * Uses userId as recipient; email must come from event payload if available.
   */
  async handleOrderCreated(payload: {
    id?: string;
    orderId?: string;
    userId: string;
    totalAmount: number;
    email?: string;
  }) {
    const orderId = payload.orderId || payload.id || 'unknown';
    const correlationId = `order-created-${orderId}`;

    this.logger.log(
      `Processing OrderCreated for order ${orderId}, user ${payload.userId}`,
    );

    return this.commandBus.execute(
      new SendNotificationCommand(
        payload.userId,
        NotificationChannel.EMAIL,
        'order-confirmation-email',
        {
          orderId,
          totalAmount: String(payload.totalAmount),
        },
        correlationId,
        NotificationPriority.NORMAL,
        payload.email,
        undefined,
        { orderId },
      ),
    );
  }

  /**
   * Handles order payment confirmation event (OrderConfirmed / OrderPaid).
   * Sends a payment confirmation email with HIGH priority.
   */
  async handleOrderPaid(payload: {
    id?: string;
    orderId?: string;
    userId: string;
    totalAmount: number;
    email?: string;
  }) {
    const orderId = payload.orderId || payload.id || 'unknown';
    const correlationId = `order-paid-${orderId}`;

    this.logger.log(
      `Processing OrderPaid for order ${orderId}, user ${payload.userId}`,
    );

    return this.commandBus.execute(
      new SendNotificationCommand(
        payload.userId,
        NotificationChannel.EMAIL,
        'payment-confirmation-email',
        {
          orderId,
          totalAmount: String(payload.totalAmount),
        },
        correlationId,
        NotificationPriority.HIGH,
        payload.email,
        undefined,
        { orderId },
      ),
    );
  }

  /**
   * Handles order shipped event.
   * Sends a shipping notification email.
   */
  async handleOrderShipped(payload: {
    id?: string;
    orderId?: string;
    userId: string;
    trackingNumber?: string;
    carrier?: string;
    email?: string;
  }) {
    const orderId = payload.orderId || payload.id || 'unknown';
    const correlationId = `order-shipped-${orderId}`;

    this.logger.log(
      `Processing OrderShipped for order ${orderId}, user ${payload.userId}`,
    );

    return this.commandBus.execute(
      new SendNotificationCommand(
        payload.userId,
        NotificationChannel.EMAIL,
        'shipping-notification',
        {
          orderId,
          trackingNumber: payload.trackingNumber ?? 'N/A',
          carrier: payload.carrier ?? 'N/A',
        },
        correlationId,
        NotificationPriority.NORMAL,
        payload.email,
        undefined,
        { orderId, trackingNumber: payload.trackingNumber },
      ),
    );
  }

  /**
   * Handles abandoned cart event.
   *
   * Note: CartAbandoned event does NOT exist yet in cart-service.
   * This handler is scaffolded for future use.
   */
  async handleCartAbandoned(payload: {
    userId: string;
    cartId: string;
    itemCount: number;
    email?: string;
  }) {
    const correlationId = `cart-abandoned-${payload.cartId}`;

    this.logger.log(
      `Processing CartAbandoned for cart ${payload.cartId}, user ${payload.userId}`,
    );

    return this.commandBus.execute(
      new SendNotificationCommand(
        payload.userId,
        NotificationChannel.EMAIL,
        'cart-abandoned',
        {
          cartId: payload.cartId,
          itemCount: String(payload.itemCount),
        },
        correlationId,
        NotificationPriority.LOW,
        payload.email,
        undefined,
        { cartId: payload.cartId },
      ),
    );
  }
}
