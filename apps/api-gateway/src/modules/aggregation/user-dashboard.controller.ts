import { Controller, Get, Req } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import type { GatewayRequest } from '../../common/types';
import { DashboardService } from './dashboard.service';

@ApiTags('Aggregation')
@ApiBearerAuth('jwt')
@Controller('user-dashboard')
export class UserDashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @ApiOperation({
    summary: 'Get user dashboard (BFF aggregate)',
    description:
      'Aggregates profile, recent orders, cart summary, and notifications for the authenticated user into a single response.',
  })
  @ApiResponse({ status: 200, description: 'Aggregated dashboard data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Get()
  async getDashboard(@Req() req: GatewayRequest) {
    const user = req.user;
    return this.dashboardService.getAggregatedDashboard(user!.userId);
  }
}
