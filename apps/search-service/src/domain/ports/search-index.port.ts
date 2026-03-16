import { SearchDocument } from '../entities/search-document.entity';

export const SEARCH_INDEX_PORT = Symbol('SEARCH_INDEX_PORT');

export interface BulkIndexResult {
  indexed: number;
  failed: number;
}

export interface ISearchIndexPort {
  indexDocument(doc: SearchDocument): Promise<void>;
  indexDocumentsBulk(docs: SearchDocument[]): Promise<BulkIndexResult>;
  removeDocument(id: string): Promise<void>;
  documentExists(id: string): Promise<boolean>;
}
