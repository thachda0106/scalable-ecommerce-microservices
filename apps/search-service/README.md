# Search Service

Production-grade search microservice for the e-commerce platform. Provides full-text product search, autocomplete suggestions, filtering, sorting, and pagination powered by OpenSearch.

## Architecture

4-layer DDD architecture with CQRS, event-driven indexing, and proper port/adapter separation. See [Architecture Docs](docs/search-service-architecture.md).

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/search` | Full-text product search with filters, sort, pagination |
| `GET` | `/search/suggest` | Autocomplete suggestions |
| `GET` | `/search/:id` | Get product by ID from index |
| `POST` | `/search/reindex` | Trigger full reindex |
| `GET` | `/search/health` | Health check with index stats |

## Getting Started

### Prerequisites

- Node.js 18+
- OpenSearch 2.x
- Kafka
- Redis (optional — graceful degradation)

### Running Locally

```bash
cp .env.example .env
pnpm install
pnpm run start:dev
```

### Testing

```bash
pnpm test
```

## Folder Structure

```
src/
├── domain/              # Business rules — zero @nestjs imports
│   ├── entities/        # SearchDocument, SearchResult
│   ├── value-objects/   # SearchQuery, SearchFilter, SearchSort, Pagination
│   ├── ports/           # ISearchIndexPort, ISearchQueryPort, ISearchCachePort
│   ├── events/          # Domain events
│   └── errors/          # Domain exceptions
├── application/         # CQRS commands, queries, handlers
│   ├── commands/
│   ├── queries/
│   └── handlers/
├── infrastructure/      # External integrations
│   ├── opensearch/      # Index + query adapters, mappings, management
│   ├── kafka/           # Product event consumer
│   ├── cache/           # Redis cache adapter
│   └── metrics/         # Prometheus metrics
└── interfaces/          # HTTP layer
    ├── controllers/     # SearchController
    └── dto/             # Request/response DTOs
```

## Documentation

- [Architecture](docs/search-service-architecture.md)
- [Indexing Pipeline](docs/search-service-indexing.md)
- [Query Features](docs/search-service-queries.md)
