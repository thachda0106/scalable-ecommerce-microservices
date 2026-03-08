export const PAYMENT_TOPICS = {
  PROCESSED: 'payment.processed',
  FAILED: 'payment.failed',
} as const;

export interface PaymentProcessedEvent {
  orderId: string;
  paymentId: string;
  amount: number;
  status: 'SUCCESS';
  header: {
    timestamp: string;
    correlationId: string;
  };
}

export interface PaymentFailedEvent {
  orderId: string;
  amount: number;
  reason: string;
  status: 'FAILED';
  header: {
    timestamp: string;
    correlationId: string;
  };
}
