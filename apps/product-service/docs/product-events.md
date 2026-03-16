# Product Events

## Conceptual Overview
The Product Service is the authoritative source for product catalog data. It broadcasts domain events via Kafka to notify downstream services of product lifecycle changes.

All events are strictly schemas driven by the Domain block and published asynchronously to the `product.events` topic using the **Transactional Outbox Pattern** to ensure absolute consistency between the database and Kafka.

---

### 1. `product.created`

**Fired When:** A new product is successfully created via the POST `/products` API.
**Purpose:** Trigger index creation in the search service, add constraints in the order service.

**Payload Schema:**
- `eventType`: `product.created`
- `productId`: UUID
- `name`: string
- `description`: string
- `price`: number (cents)
- `currency`: string (e.g. 'USD')
- `categoryId`: string
- `status`: Active | Inactive | Out of Stock | Archived
- `occurredOn`: ISO DateTime string

---

### 2. `product.updated`

**Fired When:** The details of an existing product (name, description, price, etc.) are modified via the PATCH `/products/:id` API.
**Purpose:** Update search indexing metadata to keep search results fresh.

**Payload Schema:**
- `eventType`: `product.updated`
- `productId`: UUID
- `name`: string (updated name)
- `description`: string (updated description)
- `price`: number (cents, updated price)
- `currency`: string
- `categoryId`: string
- `status`: current status
- `occurredOn`: ISO DateTime string

---

### 3. `product.deleted`

**Fired When:** An existing product's status transitions to `ARCHIVED` or is completely removed.
**Purpose:** Purge the product from search indexes and disable cart references.

**Payload Schema:**
- `eventType`: `product.deleted`
- `productId`: UUID
- `occurredOn`: ISO DateTime string

---

### 4. `product.stock.updated`

**Fired When:** An external inventory/stock change updates the product's availability via the specific `markOutOfStock` or `restock` logic in PATCH `/products/:id/status`.
**Purpose:** Informs checkout systems of availability and search systems to filter out-of-stock items.

**Payload Schema:**
- `eventType`: `product.stock.updated`
- `productId`: UUID
- `status`: `OUT_OF_STOCK` | `ACTIVE`
- `occurredOn`: ISO DateTime string
