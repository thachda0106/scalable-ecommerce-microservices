import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('user-dashboard')
export class UserDashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getDashboard(@Req() req: Request) {
    const user = req.user as { userId: string };
    return this.dashboardService.getAggregatedDashboard(user.userId);
  }
}
