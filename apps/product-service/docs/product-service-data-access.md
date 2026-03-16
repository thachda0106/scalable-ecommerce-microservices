# Product Service Data Access

## Repository Pattern
The `IProductRepository` port (domain layer) is implemented by `TypeOrmProductRepository` (infrastructure layer).

## Pagination
- **Type**: Offset-based
- **Default page size**: 20
- **Max page size**: 100
- **Response**: `{ data: Product[], total, page, limit, totalPages }`

## Filtering
| Parameter | Type | Description |
|---|---|---|
| `status` | string | Filter by product status (ACTIVE, INACTIVE, OUT_OF_STOCK, ARCHIVED) |
| `categoryId` | string | Filter by category |
| `minPrice` | number | Minimum price (inclusive) |
| `maxPrice` | number | Maximum price (inclusive) |
| `search` | string | Name search (case-insensitive, ILIKE with wildcards) |

## Sorting
| Field | Description |
|---|---|
| `name` | Sort by product name |
| `price` | Sort by product price |
| `createdAt` | Sort by creation date (default) |

Sort order: `ASC` or `DESC` (default: `DESC`)

**Security**: Sort fields are validated against a whitelist to prevent SQL injection.

## Database Indexes
| Index | Columns | Purpose |
|---|---|---|
| `idx_products_status` | status | Filter by status |
| `idx_products_category` | categoryId | Filter by category |
| `idx_products_created_at` | createdAt | Default sort order |
| `idx_products_status_category` | status, categoryId | Combined filter |

## API Examples

```bash
# Create product
curl -X POST http://localhost:3000/products \
  -H 'Content-Type: application/json' \
  -d '{"name":"Widget","description":"A widget","price":29.99,"categoryId":"cat-1"}'

# Get all products (paginated)
curl 'http://localhost:3000/products?page=1&limit=10&sortBy=price&sortOrder=ASC'

# Search products
curl 'http://localhost:3000/products?search=widget&status=ACTIVE'

# Get by ID
curl http://localhost:3000/products/UUID

# Update product
curl -X PATCH http://localhost:3000/products/UUID \
  -H 'Content-Type: application/json' \
  -d '{"name":"Updated Widget","price":39.99}'

# Change status
curl -X PATCH http://localhost:3000/products/UUID/status \
  -H 'Content-Type: application/json' \
  -d '{"action":"deactivate"}'

# Delete product
curl -X DELETE http://localhost:3000/products/UUID
```
