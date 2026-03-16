import { SearchQuery } from '../value-objects/search-query.vo';

export const SEARCH_CACHE_PORT = Symbol('SEARCH_CACHE_PORT');

export interface ISearchCachePort {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  invalidateAll(): Promise<void>;
  generateKey(query: SearchQuery): string;
}
