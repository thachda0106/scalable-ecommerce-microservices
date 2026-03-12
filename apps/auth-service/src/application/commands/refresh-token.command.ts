import { RefreshTokenDto } from '../../interfaces/dto/refresh-token.dto';

export class RefreshTokenCommand {
  constructor(public readonly dto: RefreshTokenDto) {}
}
