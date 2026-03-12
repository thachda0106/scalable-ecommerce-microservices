import { IsEmail, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class OAuthRegisterDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  provider!: string; // 'google' | 'github'

  @IsString()
  @IsNotEmpty()
  providerId!: string;

  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  picture?: string;
}
