export class UpdateUserSettingsCommand {
  constructor(
    public readonly userId: string,
    public readonly emailNotifications?: boolean,
    public readonly pushNotifications?: boolean,
    public readonly smsNotifications?: boolean,
    public readonly language?: string,
    public readonly timezone?: string,
  ) {}
}
