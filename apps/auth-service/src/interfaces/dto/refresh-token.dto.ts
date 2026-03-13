import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Opaque refresh token from login response' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
