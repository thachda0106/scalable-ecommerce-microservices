export class SearchDocumentDto {
  id: string;
  name: string;
  description: string;
  price: number;
  status: string;
  categoryId: string | null;
}

export class SearchResponseDto {
  data: SearchDocumentDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  cursor: string | null;
  took: number;
}
