# Order & Checkout Flows

> Covers: **Checkout**, **Create Order**, **Order Cancel**
> Service: `order-service` | Database: `order_db` | Saga: `CheckoutSagaOrchestrator`

---

## FLOW 15: Checkout / Create Order

### Step-by-Step Flow

```
Step 1:  Browser → POST /orders { userId, items: [{ productId, quantity, price }] }
         Authorization: Bearer <accessToken>
Step 2:  Route53 → CloudFront → WAF → ALB → API Gateway
Step 3:  API Gateway → JwtAuthGuard → verify JWT → extract { sub, role }
Step 4:  API Gateway → ThrottlerGuard → Forward to Order Service
Step 5:  Order Service → OrderController.createOrder() → CreateOrderHandler.execute()
Step 6:  CreateOrderHandler → Validate items (non-empty, quantities > 0, prices > 0)
Step 7:  CreateOrderHandler → Construct domain value objects:
         - OrderId.create(uuid)
         - UserId.create(userId)
         - OrderItem[] with productId, quantity, price
         - Money (totalPrice = sum of items)
         - OrderStatus = CREATED
Step 8:  CreateOrderHandler → Order.create({ id, userId, items, totalPrice, status: CREATED })
Step 9:  CreateOrderHandler → order.addDomainEvent(new OrderCreatedEvent)
Step 10: CreateOrderHandler → Within DB transaction:
         - INSERT INTO orders (id, user_id, status, total_amount, ...)
         - INSERT INTO order_items (order_id, product_id, quantity, price) for each item
         - INSERT INTO outbox_events (type='order.created', payload={orderId, userId, items, totalAmount})
         - COMMIT
Step 11: CreateOrderHandler → publishAll(order.pullDomainEvents())
Step 12: Response → 201 Created { orderId, message: "Order created successfully" }
Step 13: OutboxProcessor → polls outbox → publishes to Kafka 'order.events'
Step 14: ══════════════ SAGA BEGINS ══════════════
Step 15: Inventory Service consumes 'order.created' → reserves stock
Step 16: If stock reserved → publishes 'inventory.reserved' to Kafka
Step 17: Order Service InventoryEventConsumer → receives 'inventory.reserved'
Step 18: CheckoutSagaOrchestrator.onInventoryReserved(orderId):
         - Load order, verify status = CREATED
         - Transition: order.requestPayment() → status = PENDING_PAYMENT
         - Save order + publish domain events
         - paymentService.requestPayment(orderId, amount, currency, userId)
         - → Publishes ProcessPayment command to 'payment.commands' topic
Step 19: Payment Service consumes 'payment.commands' → processes payment
Step 20: If payment succeeds → publishes 'payment.processed' to Kafka
Step 21: Order Service PaymentEventConsumer → receives 'payment.processed'
         - ConfirmPaymentHandler → order.confirmPayment(paymentId)
         - status = PAYMENT_CONFIRMED → save
Step 22: ══════════════ SAGA COMPLETE ══════════════
```

### Sequence Diagram — Complete Checkout Saga

```mermaid
sequenceDiagram
    participant B as Browser
    participant GW as API Gateway
    participant OS as Order Service
    participant ODB as PostgreSQL (order_db)
    participant K as Kafka
    participant IS as Inventory Service
    participant IDB as PostgreSQL (inventory_db)
    participant PS as Payment Service
    participant PDB as PostgreSQL (payment_db)

    B->>GW: POST /orders {userId, items}
    GW->>OS: Forward (JWT verified)
    OS->>ODB: BEGIN
    OS->>ODB: INSERT orders (status=CREATED)
    OS->>ODB: INSERT order_items
    OS->>ODB: INSERT outbox_events (order.created)
    OS->>ODB: COMMIT
    OS-->>GW: 201 {orderId}
    GW-->>B: 201 Created

    Note over K: OutboxProcessor publishes
    OS->>K: order.created

    K->>IS: order.created (consumer group: inventory-service)
    IS->>IS: InboxService.handleIncoming() — dedup
    IS->>IDB: BEGIN
    IS->>IDB: UPDATE stock SET reserved += qty WHERE product_id = ?
    IS->>IDB: INSERT outbox_events (inventory.reserved)
    IS->>IDB: COMMIT

    IS->>K: inventory.reserved
    K->>OS: inventory.reserved (consumer group: order-service-inventory)
    
    OS->>OS: InboxService → CheckoutSagaOrchestrator.onInventoryReserved()
    OS->>ODB: UPDATE orders SET status='PENDING_PAYMENT'
    OS->>K: payment.commands (ProcessPayment)
    
    K->>PS: ProcessPayment command
    PS->>PS: InboxService.handleIncoming() — dedup
    PS->>PDB: BEGIN
    PS->>PDB: INSERT payments (status=SUCCESS)
    PS->>PDB: INSERT outbox_events (payment.processed)
    PS->>PDB: COMMIT

    PS->>K: payment.processed
    K->>OS: payment.processed (consumer group: order-service-payment)
    
    OS->>OS: InboxService → ConfirmPaymentHandler
    OS->>ODB: UPDATE orders SET status='PAYMENT_CONFIRMED'
```

### Order State Machine

```
                              ┌─────────────────────────────────────┐
                              │         ORDER STATE MACHINE         │
                              └─────────────────────────────────────┘
                              
  ┌─────────┐   inventory     ┌────────────────┐   payment    ┌─────────────────┐
  │ CREATED │──reserved────→ │ PENDING_PAYMENT │──success───→ │PAYMENT_CONFIRMED│
  └────┬────┘                 └───────┬────────┘              └────────┬────────┘
       │                              │                               │
       │ inventory                    │ payment                       │ ship
       │ failed                       │ failed                        ▼
       │                              │                        ┌────────────┐
       ▼                              ▼                        │  SHIPPED   │
  ┌─────────┐                   ┌─────────┐                   └─────┬──────┘
  │CANCELLED│◄──compensation───│CANCELLED │                         │ deliver
  └─────────┘                   └─────────┘                         ▼
                                                               ┌────────────┐
       ┌──────────────────────────────────────────────────────│ DELIVERED  │
       │                                                       └─────┬──────┘
       │ user cancel (any non-shipped state)                        │ refund
       ▼                                                             ▼
  ┌─────────┐                                                  ┌──────────┐
  │CANCELLED│                                                  │ REFUNDED │
  └─────────┘                                                  └──────────┘
```

### Example API Request/Response

**Request:**
```http
POST /orders HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
  "userId": "usr-123e4567",
  "items": [
    { "productId": "prod-001", "quantity": 2, "price": 9999 },
    { "productId": "prod-002", "quantity": 1, "price": 4999 }
  ]
}
```

**Response (201):**
```json
{
  "orderId": "ord-789e0123-e89b-12d3-a456-426614174000",
  "message": "Order created successfully"
}
```

### Example Kafka Events (Saga Sequence)

**1. order.created (topic: order.events)**
```json
{
  "type": "order.created",
  "schemaVersion": 1,
  "source": "order-service",
  "correlationId": "corr-uuid-001",
  "timestamp": "2026-03-22T10:00:00.000Z",
  "payload": {
    "orderId": "ord-789e0123",
    "userId": "usr-123e4567",
    "items": [
      { "productId": "prod-001", "quantity": 2, "price": 9999 },
      { "productId": "prod-002", "quantity": 1, "price": 4999 }
    ],
    "totalAmount": 24997
  }
}
```

**2. inventory.reserved (topic: inventory.events)**
```json
{
  "type": "inventory.reserved",
  "schemaVersion": 1,
  "source": "inventory-service",
  "correlationId": "corr-uuid-001",
  "timestamp": "2026-03-22T10:00:01.000Z",
  "payload": {
    "orderId": "ord-789e0123",
    "items": [
      { "productId": "prod-001", "quantity": 2 },
      { "productId": "prod-002", "quantity": 1 }
    ]
  }
}
```

**3. payment.commands (topic: payment.commands)**
```json
{
  "type": "ProcessPayment",
  "payload": {
    "orderId": "ord-789e0123",
    "userId": "usr-123e4567",
    "amountInCents": 24997,
    "currency": "USD"
  }
}
```

**4. payment.processed (topic: payment.events)**
```json
{
  "type": "PaymentProcessed",
  "schemaVersion": 1,
  "source": "payment-service",
  "correlationId": "corr-uuid-001",
  "timestamp": "2026-03-22T10:00:03.000Z",
  "payload": {
    "orderId": "ord-789e0123",
    "paymentId": "pay-uuid-001",
    "amount": 24997,
    "status": "SUCCESS"
  }
}
```

### Example Database Records

**`orders` table:**
```
id:           ord-789e0123
user_id:      usr-123e4567
status:       CREATED → PENDING_PAYMENT → PAYMENT_CONFIRMED (progression)
total_amount: 24997
currency:     USD
created_at:   2026-03-22T10:00:00.000Z
updated_at:   2026-03-22T10:00:03.000Z
```

**`order_items` table:**
```
id:         oi-001          | oi-002
order_id:   ord-789e0123    | ord-789e0123
product_id: prod-001        | prod-002
quantity:   2               | 1
price:      9999            | 4999
```

---

## FLOW 16: Order Cancel

### Step-by-Step Flow

```
Step 1:  Browser → PATCH /orders/ord-789e0123/cancel { reason: "Changed my mind" }
         Authorization: Bearer <accessToken>
Step 2:  Route53 → CloudFront → WAF → ALB → API Gateway
Step 3:  API Gateway → JwtAuthGuard → verify JWT → Forward to Order Service
Step 4:  OrderController.cancelOrder() → CancelOrderHandler.execute(CancelOrderCommand)
Step 5:  CancelOrderHandler → orderRepository.findById(orderId)
Step 6:  If not found → throw NotFoundException(404)
Step 7:  CancelOrderHandler → order.cancel(reason)
         Domain validation:
         - Cannot cancel if SHIPPED, DELIVERED, or REFUNDED
         - Can cancel if CREATED, PENDING_PAYMENT, PAYMENT_CONFIRMED
Step 8:  CancelOrderHandler → order.addDomainEvent(new OrderCancelledEvent)
Step 9:  CancelOrderHandler → DB transaction:
         - UPDATE orders SET status='CANCELLED', cancel_reason=? WHERE id=?
         - INSERT INTO outbox_events (type='order.cancelled', payload)
         - COMMIT
Step 10: Response → 200 { message: "Order ord-789e0123 cancelled" }
Step 11: OutboxProcessor → publishes order.cancelled to Kafka
Step 12: Inventory Service → consumes order.cancelled → releases reserved stock
Step 13: Payment Service (if paid) → initiates refund
Step 14: Notification Service → sends cancellation notification
```

### Compensation Flow (Saga)

```mermaid
sequenceDiagram
    participant OS as Order Service
    participant K as Kafka
    participant IS as Inventory Service
    participant NS as Notification Service

    OS->>K: order.cancelled {orderId, reason}
    
    par Compensation events
        K->>IS: order.cancelled
        IS->>IS: InboxService → ReleaseStockCommand
        IS->>IS: Release reserved quantities
        IS->>K: inventory.released {orderId, items}
    and
        K->>NS: order.cancelled
        NS->>NS: Send cancellation email/push
    end
```

### Error Scenarios

| Error | Cause | HTTP Status | Handling |
|---|---|---|---|
| Order not found | Invalid orderId | 404 Not Found | NotFoundException |
| Invalid state | Order already shipped | 422 Unprocessable | Domain exception — `InvalidStatusTransitionException` |
| Already cancelled | Double cancel attempt | 422 Unprocessable | Domain state machine rejects |
| Unauthorized | Non-owner cancelling | 403 Forbidden | Ownership check in handler |
