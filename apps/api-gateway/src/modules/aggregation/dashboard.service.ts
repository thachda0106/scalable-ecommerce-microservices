/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { Injectable, Logger } from '@nestjs/common';
import { BaseHttpClient } from '../../common/http-client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly httpClient: BaseHttpClient,
    private readonly configService: ConfigService,
  ) {}

  async getAggregatedDashboard(userId: string) {
    const userServiceUrl = this.configService.get<string>(
      'gateway.services.user',
    );
    const orderServiceUrl = this.configService.get<string>(
      'gateway.services.order',
    );
    const notificationServiceUrl = this.configService.get<string>(
      'gateway.services.notification',
    );

    const headers = { 'x-user-id': userId };

    const [userResult, ordersResult, notificationsResult] =
      await Promise.allSettled([
        this.httpClient.forwardRequest(`${userServiceUrl}/users/${userId}`, {
          method: 'GET',
          url: `/users/${userId}`,
          headers,
        } as any),
        this.httpClient.forwardRequest(
          `${orderServiceUrl}/orders?userId=${userId}`,
          {
            method: 'GET',
            url: `/orders?userId=${userId}`,
            headers,
          } as any,
        ),
        this.httpClient.forwardRequest(
          `${notificationServiceUrl}/notifications?userId=${userId}`,
          {
            method: 'GET',
            url: `/notifications?userId=${userId}`,
            headers,
          } as any,
        ),
      ]);

    return {
      user: userResult.status === 'fulfilled' ? userResult.value : null,
      recentOrders:
        ordersResult.status === 'fulfilled' ? ordersResult.value : [],
      notifications:
        notificationsResult.status === 'fulfilled'
          ? notificationsResult.value
          : [],
      errors: {
        user:
          userResult.status === 'rejected'
            ? (userResult.reason as Error).message
            : null,
        orders:
          ordersResult.status === 'rejected'
            ? (ordersResult.reason as Error).message
            : null,
        notifications:
          notificationsResult.status === 'rejected'
            ? (notificationsResult.reason as Error).message
            : null,
      },
    };
  }
}
