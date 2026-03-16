export class UpdateUserCommand {
  constructor(
    public readonly userId: string,
    public readonly email?: string,
    public readonly username?: string,
  ) {}
}
