import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { GatewayRequest } from "../../common/types";
import { DashboardService } from "./dashboard.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";

@Controller("user-dashboard")
export class UserDashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getDashboard(@Req() req: GatewayRequest) {
    const user = req.user;
    return this.dashboardService.getAggregatedDashboard(user!.userId);
  }
}
