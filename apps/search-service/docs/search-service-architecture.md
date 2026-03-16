# Search Service Architecture

## System Design
The search service embraces a clean, modular 4-layer Domain-Driven Design (DDD) architecture coupled with the Command Query Responsibility Segregation (CQRS) pattern. This enforces high cohesion, loose coupling, and distinct separation of concerns.

### 1. Domain Layer
The heart of the application containing core business rules. It contains:
- **Entities**: `SearchDocument` (read model) and `SearchResult` (wrapper for pagination).
- **Value Objects**: Immutables like `SearchQuery`, `SearchFilter`, `SearchSort`, and `Pagination`.
- **Ports**: Interfaces such as `ISearchIndexPort`, `ISearchQueryPort`, and `ISearchCachePort`.
- **Constraint**: Strict absence of framework dependencies (zero `@nestjs` imports).

### 2. Application Layer
Responsible for application use cases driven by CQRS.
- **Commands**: e.g., `IndexProductCommand`, `RemoveProductCommand` for state mutations.
- **Queries**: e.g., `SearchProductsQuery`, `GetSuggestionsQuery` for data retrieval.
- **Handlers**: Encapsulate the logic, orchestrating calls between the domain ports (e.g., executing a cache-first query strategy).

### 3. Infrastructure Layer
Provides technical capabilities and external integrations.
- **Search Engine**: Adapters for OpenSearch/Elasticsearch including clients, index management, and query building.
- **Event Streaming**: Kafka consumer subscribing to product events and dispatching commands.
- **Caching**: Redis-backed cache adapter employing graceful degradation.
- **Observability**: Prometheus metrics via `prom-client` tracking latencies, hit rates, and operation counts.

### 4. Interface Layer
The entry point into the system from the outside world.
- **Controllers**: Thin HTTP endpoints mapping REST actions to CQRS dispatchers.
- **DTOs**: `class-validator` decorated classes ensuring payload integrity before processing.

## Benefits
- **Scalability**: CQRS naturally splits read and write workloads, optimizing for read-heavy search patterns.
- **Resilience**: The system functions even if Redis cache goes down (graceful degradation) and uses dead-letter queues (DLQ) for failed Kafka indexing events.
- **Extensibility**: Search engines or data stores can be swapped seamlessly by modifying adapters matching the defined port interfaces.
