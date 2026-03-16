import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsObject,
  IsOptional,
  IsEmail,
} from 'class-validator';
import { NotificationChannel } from '../../../domain/enums/notification-channel.enum';
import { NotificationPriority } from '../../../domain/enums/notification-priority.enum';

export class SendNotificationDto {
  @IsString()
  @IsNotEmpty()
  recipientId: string;

  @IsEnum(NotificationChannel)
  channel: NotificationChannel;

  @IsString()
  @IsNotEmpty()
  templateSlug: string;

  @IsObject()
  variables: Record<string, string>;

  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @IsOptional()
  @IsEmail()
  recipientEmail?: string;

  @IsOptional()
  @IsString()
  recipientPhone?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
