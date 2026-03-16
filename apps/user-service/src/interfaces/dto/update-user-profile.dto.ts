import { IsOptional, IsString, MaxLength, IsDateString, IsUrl, Matches } from 'class-validator';

export class UpdateUserProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string | null;

  @IsOptional()
  @IsUrl({}, { message: 'Avatar must be a valid URL' })
  avatar?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'Phone number must be in E.164 format (e.g. +84912345678)',
  })
  phoneNumber?: string | null;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string | null;
}
