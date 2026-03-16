# Search Service

## Service Overview
The `search-service` is a production-grade microservice responsible for providing fast, relevant, and scalable search capabilities for the e-commerce platform. It provides full-text product search, faceted filtering, sorting, pagination, and autocomplete suggestions. The service maintains a read-optimized view of products by consuming change events from the primary data sources.

## Search Architecture
The service follows a 4-layer Domain-Driven Design (DDD) architecture with CQRS.
- **Domain Layer**: Framework-agnostic value objects, entities (e.g., `SearchDocument`), ports, and domain events.
- **Application Layer**: CQRS Commands and Queries with handlers encapsulating business use cases, utilizing a cache-first pattern.
- **Infrastructure Layer**: Adapters for OpenSearch/Elasticsearch, a Kafka event consumer for data synchronization, and Redis for caching.
- **Interface Layer**: A thin REST controller exposing the HTTP API, and Prometheus metrics for observability.

For more details, see [Architecture Documentation](docs/search-service-architecture.md).

## Search Engine Integration
Powered by Elasticsearch / OpenSearch, the service uses specialized index mappings (e.g., `search_as_you_type`, `completion` suggester) to provide rich search experiences. It leverages a custom `QueryBuilder` to translate domain queries (full-text matches, filters, sorting) into optimized search engine DSL requests.
For more details, see [Search Engine Integration](docs/search-engine-integration.md).

## Indexing Flow
The service stays synchronized with the source of truth via event-driven indexing. It listens to Kafka topics for product lifecycle events (`product.created`, `product.updated`, `product.deleted`) and immediately reflects these changes in the search index using bulk operations and alias rotation for zero-downtime reindexing.
For more details, see [Indexing Flow Documentation](docs/search-indexing-flow.md).

## Query Flow
Search queries arrive via HTTP GET requests and are validated. The query handler first attempts to fulfill the request from a fast Redis cache. On a cache miss, the query is translated into Eliasicsearch/OpenSearch DSL to fetch the results, which are then formatted, cached for subsequent requests, and returned to the user.
For more details, see [Query Flow Documentation](docs/search-query-flow.md).

## Setup Instructions
1. Navigate to the service directory: `cd apps/search-service`
2. Install dependencies: `pnpm install`
3. Copy the environment variables template: `cp .env.example .env`
4. Update the `.env` file with appropriate values for your platform.
5. Start the service: `pnpm run start:dev`

## Environment Variables
The application expects various environment variables to run appropriately. Check the `.env.example` file for a complete list including configurations for the app, search engine, and caching layers.

## Testing
Run unit tests to verify domain logic, CQRS handlers, and query builders:
```bash
pnpm test
```
