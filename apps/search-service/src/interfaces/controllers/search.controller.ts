import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  Body,
  NotFoundException,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { SearchRequestDto } from '../dto/search-request.dto';
import { SearchResponseDto } from '../dto/search-response.dto';
import { SuggestionRequestDto } from '../dto/suggestion-request.dto';
import { ReindexRequestDto } from '../dto/reindex-request.dto';
import { SearchProductsQuery } from '../../application/queries/search-products.query';
import { GetSuggestionsQuery } from '../../application/queries/get-suggestions.query';
import { GetProductByIdQuery } from '../../application/queries/get-product-by-id.query';
import { RebuildIndexCommand } from '../../application/commands/rebuild-index.command';
import { SearchResult } from '../../domain/entities/search-result.entity';
import { SearchDocument } from '../../domain/entities/search-document.entity';
import { IndexManagementService } from '../../infrastructure/opensearch/index-management.service';

@Controller('search')
export class SearchController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly indexManagement: IndexManagementService,
  ) {}

  @Get()
  async search(@Query() dto: SearchRequestDto): Promise<SearchResponseDto> {
    const result: SearchResult = await this.queryBus.execute(
      new SearchProductsQuery(
        dto.query,
        dto.filters,
        dto.sortField && dto.sortOrder
          ? { field: dto.sortField, order: dto.sortOrder }
          : undefined,
        dto.page,
        dto.limit,
        dto.cursor,
      ),
    );

    return {
      data: result.documents.map((doc) => ({
        id: doc.id,
        name: doc.name,
        description: doc.description,
        price: doc.price,
        status: doc.status,
        categoryId: doc.categoryId,
      })),
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      cursor: result.cursor,
      took: result.took,
    };
  }

  @Get('suggest')
  async suggest(@Query() dto: SuggestionRequestDto): Promise<string[]> {
    return this.queryBus.execute(
      new GetSuggestionsQuery(dto.prefix, dto.limit),
    );
  }

  @Get(':id')
  async getById(@Param('id') id: string): Promise<SearchDocument> {
    const result: SearchDocument | null = await this.queryBus.execute(
      new GetProductByIdQuery(id),
    );

    if (!result) {
      throw new NotFoundException(`Product ${id} not found in search index`);
    }

    return result;
  }

  @Post('reindex')
  async reindex(
    @Body() dto: ReindexRequestDto,
  ): Promise<{ message: string }> {
    await this.commandBus.execute(new RebuildIndexCommand(dto.batchSize));
    return { message: 'Reindex started' };
  }

  @Get('health')
  async health(): Promise<{
    status: string;
    index: { docCount: number; sizeInBytes: number; status: string };
  }> {
    const indexHealth = await this.indexManagement.getIndexHealth();
    return {
      status: 'ok',
      index: indexHealth,
    };
  }
}
