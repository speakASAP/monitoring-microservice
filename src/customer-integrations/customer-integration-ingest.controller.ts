import { Body, Controller, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { CustomerIntegrationEventsService } from './customer-integration-events.service';
import { CreateCustomerIntegrationEventDto } from './dto/create-customer-integration-event.dto';

@Controller('api')
export class CustomerIntegrationIngestController {
  constructor(private readonly events: CustomerIntegrationEventsService) {}

  @Post('ingest/:apiKeyId')
  @HttpCode(202)
  ingest(
    @Param('apiKeyId') apiKeyId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-monitoring-key') monitoringKey: string | undefined,
    @Body() dto: CreateCustomerIntegrationEventDto,
  ) {
    return this.events.recordEvent(apiKeyId, this.events.extractBearerKey(authorization, monitoringKey), 'ingest', dto);
  }

  @Post('customer/webhooks/:apiKeyId')
  @HttpCode(202)
  webhook(
    @Param('apiKeyId') apiKeyId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-monitoring-key') monitoringKey: string | undefined,
    @Body() dto: CreateCustomerIntegrationEventDto,
  ) {
    return this.events.recordEvent(apiKeyId, this.events.extractBearerKey(authorization, monitoringKey), 'webhook', dto);
  }
}
