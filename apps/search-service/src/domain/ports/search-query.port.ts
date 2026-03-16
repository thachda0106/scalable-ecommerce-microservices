import { SearchDocument } from '../entities/search-document.entity';
import { SearchResult } from '../entities/search-result.entity';
import { SearchQuery } from '../value-objects/search-query.vo';

export const SEARCH_QUERY_PORT = Symbol('SEARCH_QUERY_PORT');

export interface ISearchQueryPort {
  search(query: SearchQuery): Promise<SearchResult>;
  suggest(prefix: string, limit?: number): Promise<string[]>;
  findById(id: string): Promise<SearchDocument | null>;
}
