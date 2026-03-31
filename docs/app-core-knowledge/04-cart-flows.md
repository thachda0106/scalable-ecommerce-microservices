# Cart Flows

> Covers: **Add to Cart**, **Remove from Cart**
> Service: `cart-service` | Database: `cart_db` | CQRS: `CommandBus` / `QueryBus`

---

## FLOW 13: Add to Cart

### Step-by-Step Flow

```
Step 1:  Browser → POST /cart/{userId}/items { productId, quantity, snapshottedPrice }
         Authorization: Bearer <accessToken>
Step 2:  Route53 → CloudFront → Cache MISS (POST) → WAF → ALB → API Gateway
Step 3:  API Gateway → RequestIdMiddleware → generates x-request-id
Step 4:  API Gateway → ThrottlerGuard → check Redis: 100 req/min per IP
Step 5:  API Gateway → JwtAuthGuard → verify JWT → extract { sub, role }
Step 6:  API Gateway → GatewayController.routeCart() → BaseHttpClient.forwardRequest()
         Headers forwarded: Authorization, x-request-id, x-user-id
Step 7:  Cart Service → UserIdGuard → validates userId in path matches JWT sub (prevents impersonation)
Step 8:  Cart Service → CartController.addItem() → CommandBus.execute(AddItemCommand)
Step 9:  AddItemHandler → Validate: quantity > 0, productId is valid UUID
Step 10: AddItemHandler → cartRepository.findByUserId(userId) → PostgreSQL
Step 11: If cart not found → Cart.create(userId) — new empty cart
Step 12: AddItemHandler → cart.addItem(productId, quantity, snapshottedPrice)
         Domain logic:
         - If item already exists → increase quantity
         - Validate: total items ≤ 50 (cart limit)
         - Validate: single item quantity ≤ 10
         - Snapshot price at time of add (for price change detection)
Step 13: AddItemHandler → cart.addDomainEvent(new ItemAddedToCartEvent)
Step 14: AddItemHandler → cartRepository.save(cart) → Within DB transaction:
         - UPSERT INTO cart_items (cart_id, product_id, quantity, price)
         - INSERT INTO outbox_events (type='cart.item_added', payload)
         - COMMIT
Step 15: Response → 201 Created with updated cart
Step 16: OutboxProcessor → publishes cart.item_added to Kafka
Step 17: Inventory Service (optional) → may reserve stock for cart items
Step 18: Notification Service → may send "item added" push notification
```

### Sequence Diagram

```mermaid
sequenceDiagram
    participant B as Browser
    participant GW as API Gateway
    participant CS as Cart Service
    participant DB as PostgreSQL (cart_db)
    participant K as Kafka

    B->>GW: POST /cart/{userId}/items + Bearer token
    GW->>GW: JWT verify → extract userId
    GW->>CS: Forward with auth headers
    CS->>CS: UserIdGuard: path userId == JWT sub
    CS->>CS: CommandBus.execute(AddItemCommand)
    CS->>DB: SELECT * FROM carts WHERE user_id = ?
    DB-->>CS: Existing cart (or null)
    CS->>CS: cart.addItem(productId, qty, price)
    CS->>DB: BEGIN TRANSACTION
    CS->>DB: UPSERT cart_items + INSERT outbox_events
    CS->>DB: COMMIT
    CS-->>GW: 201 {cart with updated items}
    GW-->>B: 201

    Note over K: Async via OutboxProcessor
    K->>K: cart.item_added event published
```

### Example API Request/Response

**Request:**
```http
POST /cart/usr-123e4567/items HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
  "productId": "prod-001",
  "quantity": 2,
  "snapshottedPrice": 9999
}
```

**Response (201):**
```json
{
  "userId": "usr-123e4567",
  "items": [
    {
      "productId": "prod-001",
      "quantity": 2,
      "snapshottedPrice": 9999,
      "addedAt": "2026-03-22T10:00:00.000Z"
    }
  ],
  "totalItems": 2,
  "totalPrice": 19998,
  "updatedAt": "2026-03-22T10:00:00.000Z"
}
```

### Error Scenarios

| Error | Cause | HTTP Status | Handling |
|---|---|---|---|
| User mismatch | Path userId ≠ JWT sub | 403 Forbidden | UserIdGuard |
| Invalid productId | Not a valid UUID | 400 Bad Request | ParseUUIDPipe |
| Quantity ≤ 0 | Invalid quantity | 400 Bad Request | DTO validation |
| Cart item limit | > 50 distinct items | 422 Unprocessable | Domain exception |
| Quantity limit | > 10 per item | 422 Unprocessable | Domain exception |
| Unauthorized | No/invalid JWT | 401 Unauthorized | JwtAuthGuard |

### Example Database Records

**`carts` table:**
```
id:         cart-uuid-001
user_id:    usr-123e4567
created_at: 2026-03-22T09:00:00.000Z
updated_at: 2026-03-22T10:00:00.000Z
```

**`cart_items` table:**
```
id:               item-uuid-001
cart_id:          cart-uuid-001
product_id:       prod-001
quantity:         2
snapshotted_price: 9999
added_at:         2026-03-22T10:00:00.000Z
```

---

## FLOW 14: Remove from Cart

### Step-by-Step Flow

```
Step 1:  Browser → DELETE /cart/{userId}/items/{productId}
         Authorization: Bearer <accessToken>
Step 2:  Route53 → CloudFront → WAF → ALB → API Gateway
Step 3:  API Gateway → JwtAuthGuard → verify JWT
Step 4:  API Gateway → Forward to Cart Service
Step 5:  Cart Service → UserIdGuard → verify userId matches JWT sub
Step 6:  CartController.removeItem() → CommandBus.execute(RemoveItemCommand(userId, productId))
Step 7:  RemoveItemHandler → cartRepository.findByUserId(userId)
Step 8:  If cart not found → throw NotFoundException
Step 9:  Handler → cart.removeItem(productId)
         Domain logic:
         - Find item by productId
         - If item not found → throw ItemNotFoundException
         - Remove item from cart items collection
Step 10: Handler → cart.addDomainEvent(new ItemRemovedFromCartEvent)
Step 11: Handler → cartRepository.save(cart) → DB transaction:
         - DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?
         - INSERT INTO outbox_events (type='cart.item_removed', payload)
         - COMMIT
Step 12: Response → 200 OK { updated cart }
Step 13: OutboxProcessor → publishes cart.item_removed to Kafka
Step 14: Inventory Service → may release reserved stock
```

### Sequence Diagram

```mermaid
sequenceDiagram
    participant B as Browser
    participant GW as API Gateway
    participant CS as Cart Service
    participant DB as PostgreSQL (cart_db)

    B->>GW: DELETE /cart/{userId}/items/{productId}
    GW->>GW: JWT verify
    GW->>CS: Forward
    CS->>CS: UserIdGuard check
    CS->>DB: SELECT cart + items WHERE user_id = ?
    DB-->>CS: Cart with items
    CS->>CS: cart.removeItem(productId)
    CS->>DB: BEGIN
    CS->>DB: DELETE FROM cart_items WHERE product_id = ?
    CS->>DB: INSERT INTO outbox_events
    CS->>DB: COMMIT
    CS-->>GW: 200 {updated cart}
    GW-->>B: 200
```

### Security: User Impersonation Prevention

```
UserIdGuard — Cart Service:

1. Extract userId from URL path: /cart/:userId/items
2. Extract JWT sub from request headers (set by API Gateway)
3. Compare: path.userId === jwt.sub
4. If mismatch → 403 Forbidden

This prevents:
- User A viewing/modifying User B's cart
- Horizontal privilege escalation
```
