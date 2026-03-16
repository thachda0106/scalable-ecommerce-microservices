import { IsOptional, IsBoolean, IsString, Length } from 'class-validator';

export class UpdateUserSettingsDto {
  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  pushNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  smsNotifications?: boolean;

  @IsOptional()
  @IsString()
  @Length(2, 5)
  language?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}
