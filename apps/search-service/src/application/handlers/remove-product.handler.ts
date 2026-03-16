import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { RemoveProductCommand } from '../commands/remove-product.command';
import { SEARCH_INDEX_PORT, ISearchIndexPort } from '../../domain/ports';

@CommandHandler(RemoveProductCommand)
export class RemoveProductHandler implements ICommandHandler<RemoveProductCommand> {
  private readonly logger = new Logger(RemoveProductHandler.name);

  constructor(
    @Inject(SEARCH_INDEX_PORT)
    private readonly searchIndexPort: ISearchIndexPort,
  ) {}

  async execute(command: RemoveProductCommand): Promise<void> {
    await this.searchIndexPort.removeDocument(command.id);
    this.logger.log(`Removed product ${command.id} from index`);
  }
}
