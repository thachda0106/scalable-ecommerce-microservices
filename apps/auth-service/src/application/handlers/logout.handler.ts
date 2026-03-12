import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { LogoutCommand } from "../commands/logout.command";
import { TokenStoreService } from "../../infrastructure/redis/token-store.service";

@CommandHandler(LogoutCommand)
export class LogoutHandler implements ICommandHandler<LogoutCommand> {
  constructor(private readonly tokenStoreService: TokenStoreService) {}

  async execute(command: LogoutCommand): Promise<{ message: string }> {
    await this.tokenStoreService.revokeRefreshToken(command.refreshToken);
    return { message: "Logged out successfully" };
  }
}
