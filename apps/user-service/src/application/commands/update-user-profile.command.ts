export class UpdateUserProfileCommand {
  constructor(
    public readonly userId: string,
    public readonly displayName?: string | null,
    public readonly avatar?: string | null,
    public readonly bio?: string | null,
    public readonly phoneNumber?: string | null,
    public readonly dateOfBirth?: Date | null,
  ) {}
}
