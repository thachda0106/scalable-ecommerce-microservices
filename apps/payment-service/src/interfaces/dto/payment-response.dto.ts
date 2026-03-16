export class PaymentResponseDto {
  id: string;
  orderId: string;
  userId: string;
  amountInCents: number;
  currency: string;
  status: string;
  provider: string;
  transactionId: string | null;
  idempotencyKey: string | null;
  failReason: string | null;
  createdAt: string;
  updatedAt: string;
}
