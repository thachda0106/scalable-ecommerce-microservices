import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { RebuildIndexCommand } from '../commands/rebuild-index.command';

@CommandHandler(RebuildIndexCommand)
export class RebuildIndexHandler implements ICommandHandler<RebuildIndexCommand> {
  private readonly logger = new Logger(RebuildIndexHandler.name);

  async execute(command: RebuildIndexCommand): Promise<void> {
    this.logger.log(
      `Rebuild index requested with batch size ${command.batchSize}`,
    );
    // Full reindex logic will be wired via IndexManagementService in Wave 3
    // For now, this serves as a command dispatch target
  }
}
