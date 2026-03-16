# Order Service Events

## Domain Events

All events extend `BaseDomainEvent` and are published via the transactional outbox pattern to the `order.events` Kafka topic.

| Event | Trigger | Payload |
|-------|---------|---------|
| `order.created` | Order.create() | orderId, userId, items[], totalPrice, currency |
| `order.payment.requested` | Order.requestPayment() | orderId, totalPrice, currency, userId |
| `order.paid` | Order.confirmPayment() | orderId, paymentId |
| `order.confirmed` | Order.confirm() | orderId |
| `order.cancelled` | Order.cancel() | orderId, reason |
| `order.shipped` | Order.ship() | orderId, trackingNumber |
| `order.completed` | Order.deliver() | orderId |
| `order.refunded` | Order.refund() | orderId, refundAmountInCents, currency, reason |

## Consumed Events

| Topic | Event Type | Action |
|-------|-----------|--------|
| `payment.events` | `payment.completed` | ConfirmPaymentHandler → Order.confirmPayment() |
| `payment.events` | `payment.failed` | CancelOrderHandler → Order.cancel() |
| `inventory.events` | `stock.reserved` | SagaOrchestrator → Order.requestPayment() |
| `inventory.events` | `stock.reservation.failed` | CancelOrderHandler → Order.cancel() |

## Event Flow Diagram

```
OrderCreated ──→ [inventory listens] ──→ StockReserved ──→ [order listens]
                                                                │
                                                                ▼
                                                     Order.requestPayment()
                                                                │
                                                                ▼
                                              PaymentRequested ──→ [payment listens]
                                                                         │
                                               ┌─────────────────────────┤
                                               ▼                         ▼
                                       PaymentCompleted           PaymentFailed
                                               │                         │
                                               ▼                         ▼
                                    Order.confirmPayment()       Order.cancel()
```
