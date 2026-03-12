export interface OAuthUserProfile {
  email: string;
  provider: string;
  providerId: string;
  firstName?: string;
  lastName?: string;
  picture?: string;
}

export class OAuthLoginCommand {
  constructor(public readonly profile: OAuthUserProfile) {}
}
