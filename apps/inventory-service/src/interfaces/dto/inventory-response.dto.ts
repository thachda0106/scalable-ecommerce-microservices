export interface InventoryResponseDto {
  productId: string;
  sku: string;
  availableStock: number;
  reservedStock: number;
  soldStock: number;
  totalStock: number;
  lowStockThreshold: number;
  isLowStock: boolean;
  updatedAt: string;
}

export interface ReserveResponseDto {
  success: boolean;
  idempotent?: boolean;
  reservations?: {
    reservationId: string;
    productId: string;
    quantity: number;
    status: string;
    expiresAt: string;
  }[];
  error?: string;
  failedItems?: {
    productId: string;
    requested: number;
    available: number;
  }[];
}

export interface ReleaseResponseDto {
  success: boolean;
  idempotent?: boolean;
  releasedCount: number;
  releasedItems: {
    productId: string;
    quantityReleased: number;
  }[];
}

export interface ConfirmResponseDto {
  success: boolean;
  idempotent?: boolean;
  confirmedItems: {
    productId: string;
    quantity: number;
    status: string;
  }[];
}
