# Product Data Model

## Conceptual Overview

The core domain revolves around the `Product` aggregate and its related entities. It defines the structure and behavior of catalog items available for sale.

### Product (Aggregate Root)

The `Product` represents a sellable item in the catalog. It acts as the consistency boundary for all product-related mutations.

**Key Attributes:**
- `id` (ProductId): Unique identifier (UUID).
- `name` (string): Display name of the product.
- `description` (string): Detailed description.
- `price` (Money): Encapsulates both amount (in cents) and currency to prevent floating point inaccuracies.
- `categoryId` (string): Reference to a ProductCategory.
- `status` (ProductStatus): State machine value object.
- `version` (number): Concurrency control version.
- `createdAt` / `updatedAt` (Date): Lifecycle timestamps.

**Behaviors:**
- Details update (`updateDetails`)
- Status transitions (`activate`, `deactivate`, `markOutOfStock`, `restock`, `archive`)

### ProductStatus (Value Object)

The status is strictly governed by a state machine to ensure only valid transitions occur.
- `ACTIVE`: Available for viewing and purchasing.
- `INACTIVE`: Hidden from normal catalog views.
- `OUT_OF_STOCK`: Visible but currently unpurchasable.
- `ARCHIVED`: Terminal state. Soft-deleted product.

---

### ProductVariant (Entity) 
*(Note: Modeled conceptually for platform growth; currently flattened or omitted based on initial implementation scope)*

Represents specific variations of a parent Product (e.g., Size, Color) that carry distinct SKUs but share the parent's core details and description.
- `id`: Unique variant ID
- `sku`: Stock Keeping Unit string
- `attributes`: Key-value pairs defining the variation (e.g., `{"size": "XL", "color": "Red"}`)
- `priceOverride`: Optional adjustment to the parent Product's price.

---

### ProductCategory (Entity)
*(Note: Frequently treated as a separate bounded context, but deeply referenced by Products)*

Represents a hierarchical taxonomy structure to organize the product catalog.
- `id`: Categorization identifier
- `name`: Category display name
- `slug`: URL-friendly identifier
- `parentId`: Reference for creating hierarchical category trees.
