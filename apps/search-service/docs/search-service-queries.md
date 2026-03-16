# Search Service — Query Features

## Full-Text Search

Uses OpenSearch `multi_match` across `name` (with `_2gram`, `_3gram` shingles) and `description`:

```bash
curl "http://localhost:3000/search?query=laptop"
```

## Autocomplete / Suggestions

Uses OpenSearch Completion Suggester on `name_suggest` field:

```bash
curl "http://localhost:3000/search/suggest?prefix=lap&limit=5"
```

Returns an array of suggestion strings: `["Laptop Pro", "Laptop Air", ...]`

## Filtering

Supported operators:

| Operator | Description | Example |
|----------|-------------|---------|
| `eq` | Exact match | `{ "field": "status", "operator": "eq", "value": "ACTIVE" }` |
| `in` | One of values | `{ "field": "status", "operator": "in", "value": ["ACTIVE","DRAFT"] }` |
| `range` | Numeric range | `{ "field": "price", "operator": "range", "value": { "min": 10, "max": 100 } }` |
| `gte` | Greater than or equal | `{ "field": "price", "operator": "gte", "value": "50" }` |
| `lte` | Less than or equal | `{ "field": "price", "operator": "lte", "value": "200" }` |

## Sorting

```bash
curl "http://localhost:3000/search?sortField=price&sortOrder=asc"
```

Sortable fields: `price`, `name`, `indexedAt`, `status`

## Pagination

### Offset-Based (default)

```bash
curl "http://localhost:3000/search?query=laptop&page=2&limit=10"
```

Best for pages 1–100. Uses OpenSearch `from/size`.

### Cursor-Based (deep pagination)

```bash
# First request — returns cursor in response
curl "http://localhost:3000/search?query=laptop&limit=10"
# Response: { "cursor": "[1234,\"abc\"]", ... }

# Next page — pass cursor
curl "http://localhost:3000/search?query=laptop&limit=10&cursor=[1234,\"abc\"]"
```

Uses OpenSearch `search_after`. Best for infinite scroll / deep pagination.

## Caching

- Search results: **60s TTL** in Redis
- Suggestions: **300s TTL** in Redis
- Cache keys: deterministic hash of query parameters
- Graceful degradation: if Redis unavailable, queries go directly to OpenSearch

## API Response Format

```json
{
  "data": [
    {
      "id": "prod-1",
      "name": "Laptop Pro",
      "description": "High-performance laptop",
      "price": 999.99,
      "status": "ACTIVE",
      "categoryId": "cat-electronics"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20,
  "totalPages": 3,
  "cursor": "[999.99,\"prod-1\"]",
  "took": 12
}
```
