import { RegisterDto } from '../../interfaces/dto/auth.dto';

export class RegisterCommand {
  constructor(public readonly dto: RegisterDto) {}
}
