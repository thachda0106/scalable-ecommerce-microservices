export class OAuthIdentity {
  private constructor(
    private readonly provider: string,
    private readonly providerId: string,
  ) {}

  public static create(provider: string, providerId: string): OAuthIdentity {
    if (!provider) throw new Error('OAuth provider cannot be empty');
    if (!providerId) throw new Error('OAuth providerId cannot be empty');
    return new OAuthIdentity(provider.toLowerCase(), providerId);
  }

  public getProvider(): string {
    return this.provider;
  }

  public getProviderId(): string {
    return this.providerId;
  }
}
