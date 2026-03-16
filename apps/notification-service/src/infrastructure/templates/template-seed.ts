import { NotificationChannel } from '../../domain/enums/notification-channel.enum';
import { NotificationTemplate } from '../../domain/entities/notification-template';

/**
 * Predefined notification templates seeded into the in-memory repository.
 *
 * Note: Research finding — order events do NOT include userName or email,
 * so templates use orderId, totalAmount, etc. directly. Email is attached
 * as a recipient field, not a template variable.
 */
export function createTemplateSeeds(): NotificationTemplate[] {
  return [
    NotificationTemplate.create({
      slug: 'welcome-email',
      name: 'Welcome Email',
      channel: NotificationChannel.EMAIL,
      subjectTemplate: 'Welcome to Our Store!',
      bodyTemplate:
        'Hi there!\n\nThank you for registering with {{email}}. Your account is ready.\n\nHappy shopping!',
      requiredVariables: ['email'],
    }),
    NotificationTemplate.create({
      slug: 'order-confirmation-email',
      name: 'Order Confirmation',
      channel: NotificationChannel.EMAIL,
      subjectTemplate: 'Order #{{orderId}} Confirmed',
      bodyTemplate:
        'Your order #{{orderId}} for ${{totalAmount}} has been placed successfully.\n\nThank you for your purchase!',
      requiredVariables: ['orderId', 'totalAmount'],
    }),
    NotificationTemplate.create({
      slug: 'payment-confirmation-email',
      name: 'Payment Confirmation',
      channel: NotificationChannel.EMAIL,
      subjectTemplate: 'Payment Received for Order #{{orderId}}',
      bodyTemplate:
        'We have received your payment of ${{totalAmount}} for order #{{orderId}}.\n\nYour order is now being processed.',
      requiredVariables: ['orderId', 'totalAmount'],
    }),
    NotificationTemplate.create({
      slug: 'shipping-notification',
      name: 'Shipping Notification',
      channel: NotificationChannel.EMAIL,
      subjectTemplate: 'Your Order #{{orderId}} Has Shipped!',
      bodyTemplate:
        'Great news! Your order #{{orderId}} has been shipped.\n\nTracking: {{trackingNumber}} via {{carrier}}',
      requiredVariables: ['orderId', 'trackingNumber', 'carrier'],
    }),
    NotificationTemplate.create({
      slug: 'cart-abandoned',
      name: 'Cart Abandoned Reminder',
      channel: NotificationChannel.EMAIL,
      subjectTemplate: 'You left items in your cart!',
      bodyTemplate:
        'You have {{itemCount}} items waiting in your cart ({{cartId}}).\n\nComplete your purchase before they sell out!',
      requiredVariables: ['itemCount', 'cartId'],
    }),
  ];
}
