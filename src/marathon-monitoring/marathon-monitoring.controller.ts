import { Controller, Get, Query } from '@nestjs/common';
import { MarathonMonitoringService } from './marathon-monitoring.service';

@Controller('api/marathon-monitoring')
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
