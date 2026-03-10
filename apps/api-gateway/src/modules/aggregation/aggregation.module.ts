import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { UserDashboardController } from './user-dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
    ConfigModule,
  ],
  controllers: [UserDashboardController],
  providers: [DashboardService],
})
export class AggregationModule {}
