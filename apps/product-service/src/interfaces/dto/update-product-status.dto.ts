import { IsIn } from 'class-validator';

export class UpdateProductStatusDto {
  @IsIn(['activate', 'deactivate', 'markOutOfStock', 'archive', 'restock'])
  action: 'activate' | 'deactivate' | 'markOutOfStock' | 'archive' | 'restock';
}
