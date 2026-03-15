import { IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LogoutDto {
  @ApiProperty({ description: 'Refresh token to revoke' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;

  @ApiPropertyOptional({
    description:
      'JWT ID (jti) from the access token — used to blocklist the access token before it expires',
  })
  @IsString()
  @IsOptional()
  jti?: string;

  @ApiPropertyOptional({ description: 'User ID (required when jti is provided)' })
  @IsString()
  @IsOptional()
  userId?: string;
}
