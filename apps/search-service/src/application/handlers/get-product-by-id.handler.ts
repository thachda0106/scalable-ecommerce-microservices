import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { GetProductByIdQuery } from '../queries/get-product-by-id.query';
import { SEARCH_QUERY_PORT, ISearchQueryPort } from '../../domain/ports';
import { SearchDocument } from '../../domain/entities';

@QueryHandler(GetProductByIdQuery)
export class GetProductByIdHandler
  implements IQueryHandler<GetProductByIdQuery>
{
  private readonly logger = new Logger(GetProductByIdHandler.name);

  constructor(
    @Inject(SEARCH_QUERY_PORT)
    private readonly searchQueryPort: ISearchQueryPort,
  ) {}

  async execute(query: GetProductByIdQuery): Promise<SearchDocument | null> {
    return this.searchQueryPort.findById(query.id);
  }
}
