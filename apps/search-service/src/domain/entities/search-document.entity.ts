export class SearchDocument {
  private constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly description: string,
    public readonly price: number,
    public readonly status: string,
    public readonly categoryId: string | null,
    public readonly attributes: Record<string, unknown>,
    public readonly indexedAt: Date,
  ) {}

  static create(params: {
    id: string;
    name: string;
    description: string;
    price: number;
    status: string;
    categoryId?: string | null;
    attributes?: Record<string, unknown>;
    indexedAt?: Date;
  }): SearchDocument {
    return new SearchDocument(
      params.id,
      params.name,
      params.description,
      params.price,
      params.status,
      params.categoryId ?? null,
      params.attributes ?? {},
      params.indexedAt ?? new Date(),
    );
  }

  static fromProductEvent(event: {
    id: string;
    name: string;
    description?: string;
    price: number;
    status?: string;
    categoryId?: string;
    attributes?: Record<string, unknown>;
  }): SearchDocument {
    return SearchDocument.create({
      id: event.id,
      name: event.name,
      description: event.description ?? '',
      price: event.price,
      status: event.status ?? 'ACTIVE',
      categoryId: event.categoryId ?? null,
      attributes: event.attributes ?? {},
    });
  }
}
