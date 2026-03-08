import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  async sendEmail(to: string, subject: string, body: string) {
    // In a real application, this would integrate with AWS SES, SendGrid, etc.
    this.logger.log(`[MOCK EMAIL] To: ${to} | Subject: ${subject}`);
    this.logger.debug(`[MOCK EMAIL BODY]\n${body}`);
  }

  async sendSms(to: string, message: string) {
    this.logger.log(`[MOCK SMS] To: ${to} | Message: ${message}`);
  }
}
