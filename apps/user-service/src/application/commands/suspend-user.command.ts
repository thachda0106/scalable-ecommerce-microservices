export class SuspendUserCommand {
  constructor(
    public readonly userId: string,
    public readonly reason: string,
  ) {}
}
