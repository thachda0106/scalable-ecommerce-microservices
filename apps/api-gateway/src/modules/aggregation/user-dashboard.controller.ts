import { Controller, Get, Req } from '@nestjs/common';
import type { GatewayRequest } from '../../common/types';
import { DashboardService } from './dashboard.service';

@Controller('user-dashboard')
export class UserDashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  async getDashboard(@Req() req: GatewayRequest) {
    const user = req.user;
    return this.dashboardService.getAggregatedDashboard(user!.userId);
  }
}
