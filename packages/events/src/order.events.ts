export const ORDER_TOPICS = {
  CREATED: 'order.created',
  UPDATED: 'order.updated',
  CANCELLED: 'order.cancelled',
  COMPLETED: 'order.completed',
} as const;

export interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
}

export interface OrderCreatedEvent {
  orderId: string;
  userId: string;
  items: OrderItem[];
  totalAmount: number;
  header: {
    timestamp: string;
    correlationId: string;
  };
}

export interface OrderStateChangedEvent {
  orderId: string;
  newState: 'PENDING' | 'PAYMENT_PROCESSED' | 'INVENTORY_RESERVED' | 'COMPLETED' | 'CANCELLED';
  reason?: string;
  header: {
    timestamp: string;
    correlationId: string;
  };
}
