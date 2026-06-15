import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common';
import { MonitoringAuthGuard } from '../auth/monitoring-auth.guard';
import { CustomerIntegrationEventsService } from './customer-integration-events.service';

@Controller('api/customer/integrations/:integrationId/events')
@UseGuards(MonitoringAuthGuard)
export class CustomerIntegrationEventsController {
  constructor(private readonly events: CustomerIntegrationEventsService) {}

  @Get()
  list(@Request() req, @Param('integrationId') integrationId: string) {
    return this.events.listEvents(req.user, integrationId);
  }
}
