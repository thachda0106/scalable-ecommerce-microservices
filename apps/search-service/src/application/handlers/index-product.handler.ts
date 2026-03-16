import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { IndexProductCommand } from '../commands/index-product.command';
import { SEARCH_INDEX_PORT, ISearchIndexPort } from '../../domain/ports';
import { SearchDocument } from '../../domain/entities';

@CommandHandler(IndexProductCommand)
export class IndexProductHandler implements ICommandHandler<IndexProductCommand> {
  private readonly logger = new Logger(IndexProductHandler.name);

  constructor(
    @Inject(SEARCH_INDEX_PORT)
    private readonly searchIndexPort: ISearchIndexPort,
  ) {}

  async execute(command: IndexProductCommand): Promise<void> {
    const doc = SearchDocument.fromProductEvent({
      id: command.id,
      name: command.name,
      description: command.description,
      price: command.price,
      status: command.status,
      categoryId: command.categoryId,
      attributes: command.attributes,
    });

    await this.searchIndexPort.indexDocument(doc);
    this.logger.log(`Indexed product ${command.id}`);
  }
}
