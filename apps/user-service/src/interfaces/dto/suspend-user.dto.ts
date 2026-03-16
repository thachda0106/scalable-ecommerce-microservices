import { IsString, IsNotEmpty } from 'class-validator';

export class SuspendUserDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}
