import { LoginDto } from '../../interfaces/dto/auth.dto';

export class LoginQuery {
  constructor(public readonly dto: LoginDto) {}
}
