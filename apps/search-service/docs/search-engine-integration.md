# Search Engine Integration

## Overview
The search service utilizes a dedicated search engine—specifically Elasticsearch or its open-source equivalent, OpenSearch—to provide complex text analysis, tokenization, sorting, filtering, and high-performance ingestion capabilities that standard relational databases cannot provide.

## Adapter Architecture
Because the search service operates using a strict DDD port-and-adapter methodology, the core application logic is completely unaware of the *specific* search engine implementation stringently acting against the `ISearchIndexPort` and `ISearchQueryPort` token interfaces. 

Adapters located in `src/infrastructure/opensearch/` fulfill these interface contracts by translating domain models to proprietary configurations:
- `OpenSearchIndexAdapter`
- `OpenSearchQueryAdapter`
- `IndexManagementService`

## Mapping Strategies
To support robust matching, index mappings are explicitly defined during `IndexManagementService` bootstrap rather than relying on dynamic mapping guesswork.

### Full-Text Fields
Product `description` utilizes the `standard` text analyzer to tokenize generic language phrases properly.

### Search-as-you-type
The `name` field is heavily optimized for prefix and partial token matching. It utilizes a `search_as_you_type` property defining `max_shingle_size: 3`. This creates sub-fields during indexing (`name._2gram`, `name._3gram`) which substantially improve the speed and relevancy of partial phrasing lookups without client-side manual regex.

### Suggestions
The `name_suggest` field uniquely maps to a `completion` property. Under the hood, this instructs the engine to build a highly optimized in-memory Finite State Transducer (FST) strictly designed for millisecond-speed autocomplete prefix lookups. 

## Client Configuration Setup
The search engine client is instantiated via an async provider in NestJS, retrieving cluster coordinates dynamically:
```ts
// src/infrastructure/opensearch/opensearch-client.provider.ts
const url = configService.get<string>('OPENSEARCH_URL');
const username = configService.get<string>('OPENSEARCH_USERNAME');
const password = configService.get<string>('OPENSEARCH_PASSWORD');

return new Client({ node: url, auth: { username, password } });
```
This guarantees the service can connect to disparate local, staging, or cloud-hosted search indices simply by modifying environment variables.
