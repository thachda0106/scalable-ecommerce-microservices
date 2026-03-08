export const INVENTORY_TOPICS = {
  RESERVED: 'inventory.reserved',
  RESERVATION_FAILED: 'inventory.reservation_failed',
  RELEASED: 'inventory.released',
} as const;

export interface InventoryItem {
  productId: string;
  quantity: number;
}

export interface InventoryReservedEvent {
  orderId: string;
  items: InventoryItem[];
  header: {
    timestamp: string;
    correlationId: string;
  };
}

export interface InventoryReservationFailedEvent {
  orderId: string;
  items: InventoryItem[];
  reason: string;
  header: {
    timestamp: string;
    correlationId: string;
  };
}

export interface InventoryReleasedEvent {
  orderId: string;
  items: InventoryItem[];
  reason: string;
  header: {
    timestamp: string;
    correlationId: string;
  };
}
