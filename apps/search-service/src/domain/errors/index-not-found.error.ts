import { SearchException } from './search-exception';

export class IndexNotFoundError extends SearchException {
  constructor(indexName: string) {
    super(`Search index not found: ${indexName}`);
    this.name = 'IndexNotFoundError';
  }
}
