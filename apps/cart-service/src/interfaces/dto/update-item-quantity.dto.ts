import { IsInt, Min, Max } from 'class-validator';

export class UpdateItemQuantityDto {
  @IsInt({ message: 'quantity must be an integer' })
  @Min(1, { message: 'quantity must be at least 1' })
  @Max(99, { message: 'quantity cannot exceed 99' })
  quantity: number;
}
