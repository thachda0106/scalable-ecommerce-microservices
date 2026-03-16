# Checkout Saga

## Overview

The checkout saga orchestrates the distributed transaction across Order, Inventory, and Payment services. It uses **hybrid orchestration** — the Order Service acts as the saga coordinator while services communicate via Kafka events.

## Saga Flow

```
Step 1: Customer creates order
  → OrderCreated event published to order.events
  → Inventory service listens and attempts stock reservation

Step 2: Inventory reservation result
  ✅ StockReserved → SagaOrchestrator.onInventoryReserved()
    → Order transitions to PENDING_PAYMENT
    → PaymentRequested event published
    → Payment service processes payment

  ❌ StockReservationFailed → CancelOrderHandler
    → Order transitions to CANCELLED
    → OrderCancelled event published

Step 3: Payment result
  ✅ PaymentCompleted → ConfirmPaymentHandler
    → Order transitions to PAID
    → Order can then be confirmed (PAID → CONFIRMED)

  ❌ PaymentFailed → CancelOrderHandler
    → Order transitions to CANCELLED
    → OrderCancelled published → Inventory releases stock
```

## Compensation Matrix

| Failure Point | Compensation Action | Triggered By |
|--------------|-------------------|-------------|
| Inventory reservation fails | Cancel order | InventoryEventConsumer |
| Payment fails | Cancel order → Release inventory | PaymentEventConsumer → OrderCancelled |
| Order manually cancelled | Release inventory | Admin API → OrderCancelled |

## Saga State

The saga state is **implicit** in the Order's status field:

| Order Status | Saga State | Meaning |
|-------------|-----------|---------|
| CREATED | Awaiting inventory | Stock reservation pending |
| PENDING_PAYMENT | Inventory OK, awaiting payment | Payment request sent |
| PAID | All steps complete | Ready for fulfillment |
| CANCELLED | Compensated | Failure occurred, inventory released |

## Idempotency

All event consumers check the `processed_events` table before processing:
1. Extract eventId from message
2. Check if already processed → skip if yes
3. Process event
4. Mark as processed

This prevents duplicate processing from Kafka redelivery.
