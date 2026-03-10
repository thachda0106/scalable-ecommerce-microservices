import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async getAggregatedDashboard(userId: string) {
    const userServiceUrl = this.configService.get<string>('services.user');
    const orderServiceUrl = this.configService.get<string>('services.order');
    const notificationServiceUrl = this.configService.get<string>(
      'services.notification',
    );

    const headers = { 'x-user-id': userId };

    const [userResult, ordersResult, notificationsResult] =
      await Promise.allSettled([
        lastValueFrom(
          this.httpService.get(`${userServiceUrl}/users/${userId}`, {
            headers,
          }),
        ),
        lastValueFrom(
          this.httpService.get(`${orderServiceUrl}/orders?userId=${userId}`, {
            headers,
          }),
        ),
        lastValueFrom(
          this.httpService.get(
            `${notificationServiceUrl}/notifications?userId=${userId}`,
            { headers },
          ),
        ),
      ]);

    return {
      user: userResult.status === 'fulfilled' ? userResult.value.data : null,
      recentOrders:
        ordersResult.status === 'fulfilled' ? ordersResult.value.data : [],
      notifications:
        notificationsResult.status === 'fulfilled'
          ? notificationsResult.value.data
          : [],
      errors: {
        user:
          userResult.status === 'rejected' ? userResult.reason.message : null,
        orders:
          ordersResult.status === 'rejected'
            ? ordersResult.reason.message
            : null,
        notifications:
          notificationsResult.status === 'rejected'
            ? notificationsResult.reason.message
            : null,
      },
    };
  }
}
