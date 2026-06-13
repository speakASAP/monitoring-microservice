import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { MonitoringAdminGuard } from '../auth/monitoring-admin.guard';
import { MarathonMonitoringService } from './marathon-monitoring.service';

@Controller('api/marathon-monitoring')
@UseGuards(MonitoringAdminGuard)
export class MarathonMonitoringController {
  constructor(private readonly service: MarathonMonitoringService) {}

  @Get('events')
  getEvents(
    @Query('windowMinutes') windowMinutes?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getEventSummary(
      windowMinutes ? Number(windowMinutes) : 60,
      limit ? Number(limit) : 25,
    );
  }
}
