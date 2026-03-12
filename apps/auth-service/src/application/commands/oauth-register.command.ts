import { OAuthRegisterDto } from "../../interfaces/dto/oauth-register.dto";

export class OAuthRegisterCommand {
  constructor(public readonly dto: OAuthRegisterDto) {}
}
