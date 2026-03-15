import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({ description: 'User ID (from JWT sub claim)' })
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({ description: 'Opaque refresh token from login response' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;

  @ApiProperty({
    description: 'JWT ID (jti) of the current access token — blocklisted during rotation',
    required: false,
  })
  @IsString()
  @IsNotEmpty()
  currentJti!: string;
}
