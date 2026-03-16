import { SearchDocument } from '../search-document.entity';
import { SearchResult } from '../search-result.entity';

describe('SearchDocument', () => {
  it('should create from product event payload', () => {
    const doc = SearchDocument.fromProductEvent({
      id: 'prod-1',
      name: 'Test Product',
      description: 'A test product',
      price: 29.99,
      status: 'ACTIVE',
      categoryId: 'cat-1',
    });

    expect(doc.id).toBe('prod-1');
    expect(doc.name).toBe('Test Product');
    expect(doc.price).toBe(29.99);
    expect(doc.status).toBe('ACTIVE');
    expect(doc.categoryId).toBe('cat-1');
    expect(doc.indexedAt).toBeInstanceOf(Date);
  });

  it('should handle missing optional fields', () => {
    const doc = SearchDocument.fromProductEvent({
      id: 'prod-2',
      name: 'Minimal Product',
      price: 9.99,
    });

    expect(doc.description).toBe('');
    expect(doc.status).toBe('ACTIVE');
    expect(doc.categoryId).toBeNull();
    expect(doc.attributes).toEqual({});
  });
});

describe('SearchResult', () => {
  it('should compute totalPages correctly', () => {
    const result = SearchResult.create({
      documents: [],
      total: 55,
      page: 1,
      limit: 20,
      took: 5,
    });

    expect(result.totalPages).toBe(3);
  });

  it('should return hasNextPage true when more pages exist', () => {
    const result = SearchResult.create({
      documents: [],
      total: 55,
      page: 1,
      limit: 20,
      took: 5,
    });

    expect(result.hasNextPage).toBe(true);
  });

  it('should return hasNextPage false on last page', () => {
    const result = SearchResult.create({
      documents: [],
      total: 55,
      page: 3,
      limit: 20,
      took: 5,
    });

    expect(result.hasNextPage).toBe(false);
  });

  it('should handle empty results', () => {
    const result = SearchResult.empty();

    expect(result.total).toBe(0);
    expect(result.documents).toHaveLength(0);
    expect(result.totalPages).toBe(0);
    expect(result.hasNextPage).toBe(false);
  });
});
