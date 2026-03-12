import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule } from "@nestjs/config";
import { UserDashboardController } from "./user-dashboard.controller";
import { DashboardService } from "./dashboard.service";
import { CartSummaryService } from "./cart-summary.service";
import { OrderDetailsService } from "./order-details.service";
import { ProductPageService } from "./product-page.service";

import { BaseHttpClient } from "../../common/http-client";

@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
    ConfigModule,
  ],
  controllers: [UserDashboardController],
  providers: [
    DashboardService,
    CartSummaryService,
    OrderDetailsService,
    ProductPageService,
    BaseHttpClient,
  ],
  exports: [CartSummaryService, OrderDetailsService, ProductPageService],
})
export class AggregationModule {}
