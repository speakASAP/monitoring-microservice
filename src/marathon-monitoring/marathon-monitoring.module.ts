import { Module } from '@nestjs/common';
import { MarathonMonitoringController } from './marathon-monitoring.controller';
import { MarathonMonitoringService } from './marathon-monitoring.service';

@Module({
  controllers: [MarathonMonitoringController],
  providers: [MarathonMonitoringService],
})
export class MarathonMonitoringModule {}
