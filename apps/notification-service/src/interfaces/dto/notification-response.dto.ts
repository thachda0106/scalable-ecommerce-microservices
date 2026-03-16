export class NotificationResponseDto {
  id: string;
  status: string;
  channel: string;
  templateSlug: string;
  recipientId: string;
  sentAt?: string;
  createdAt: string;
}
