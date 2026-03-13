import { Module } from '@nestjs/common';
import { HttpClientModule } from '../../common/http-client.module';
import { ConfigModule } from '@nestjs/config';
import { UserDashboardController } from './user-dashboard.controller';
import { DashboardService } from './dashboard.service';
import { CartSummaryService } from './cart-summary.service';
import { OrderDetailsService } from './order-details.service';
import { ProductPageService } from './product-page.service';

@Module({
  imports: [HttpClientModule, ConfigModule],
  controllers: [UserDashboardController],
  providers: [
    DashboardService,
    CartSummaryService,
    OrderDetailsService,
    ProductPageService,
  ],
  exports: [CartSummaryService, OrderDetailsService, ProductPageService],
})
export class AggregationModule {}
