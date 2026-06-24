import { Injectable, Inject } from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { OrderId } from '../../../domain/value-objects';
import { IOrderRepository, ORDER_REPOSITORY } from '../../../domain/ports';
import {
  IEventPublisher,
  EVENT_PUBLISHER,
  IPaymentService,
  PAYMENT_SERVICE,
} from '../../../application/ports';
import { OrderStatusEnum } from '../../../domain/value-objects/order-status.vo';
import { CancelOrderCommand } from '../../../application/commands/cancel-order.command';
import { CancelOrderHandler } from '../../../application/handlers/cancel-order.handler';

/**
 * Checkout Saga Orchestrator
 *
 * Manages the distributed checkout workflow:
 *   1. OrderCreated → (inventory-service already listens to order.events and reserves)
 *   2. InventoryReserved → Request payment via IPaymentService
 *   3. PaymentProcessed → Confirm order (handled by PaymentEventConsumer → ConfirmPaymentHandler)
 *
 * Compensation:
 *   - InventoryFailed → Cancel order (handled by InventoryEventConsumer → CancelOrderHandler)
 *   - PaymentFailed → Cancel order + release inventory (CancelOrderHandler emits order.cancelled → inventory releases)
 *   - PaymentRequestFailed → Cancel order as compensation (new)
 *
 * Saga state is tracked implicitly through Order status transitions.
 */
@Injectable()
export class CheckoutSagaOrchestrator {
  constructor(
    @Inject(Logger) private readonly logger: Logger,
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: IOrderRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
    @Inject(PAYMENT_SERVICE)
    private readonly paymentService: IPaymentService,
    private readonly cancelOrderHandler: CancelOrderHandler,
  ) {}

  /**
   * Called when inventory has been successfully reserved.
   * Transitions order to PENDING_PAYMENT and requests payment.
   * If payment request fails, compensates by cancelling the order.
   */
  async onInventoryReserved(orderId: string): Promise<void> {
    const order = await this.orderRepository.findById(OrderId.create(orderId));

    if (!order) {
      this.logger.warn(
        `Saga: Order ${orderId} not found for inventory reserved`,
      );
      return;
    }

    // Guard: only proceed if order is in CREATED status
    if (order.status.value !== OrderStatusEnum.CREATED) {
      this.logger.debug(
        `Saga: Order ${orderId} is ${order.status.value}, not CREATED. Skipping payment request.`,
      );
      return;
    }

    // Transition to PENDING_PAYMENT
    order.requestPayment();
    await this.orderRepository.save(order);

    const events = order.pullDomainEvents();
    await this.eventPublisher.publishAll(events);

    // Request payment from payment service — compensate on failure
    try {
      await this.paymentService.requestPayment(
        orderId,
        order.totalPrice.amountInCents,
        order.totalPrice.currency,
        order.userId.value,
      );

      this.logger.log(
        `Saga: Order ${orderId} → PENDING_PAYMENT. Payment requested.`,
      );
    } catch (error) {
      this.logger.error(
        `Saga: Payment request failed for order ${orderId}: ${(error as Error).message}. Compensating by cancelling order.`,
      );

      // Compensation: cancel the order to release inventory
      try {
        await this.cancelOrderHandler.execute(
          new CancelOrderCommand(
            orderId,
            'Payment request failed — saga compensation',
          ),
        );
        this.logger.log(
          `Saga: Order ${orderId} cancelled as compensation for payment request failure.`,
        );
      } catch (compensationError) {
        this.logger.error(
          `Saga: CRITICAL — Compensation failed for order ${orderId}: ${(compensationError as Error).message}. Order stuck in PENDING_PAYMENT. Manual intervention required.`,
        );
      }
    }
  }
}
