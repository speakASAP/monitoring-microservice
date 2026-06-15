import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerIntegrationEvent } from './customer-integration-event.entity';
import { CustomerIntegration } from './customer-integration.entity';
import { CustomerIntegrationEventsController } from './customer-integration-events.controller';
import { CustomerIntegrationEventsService } from './customer-integration-events.service';
import { CustomerIntegrationIngestController } from './customer-integration-ingest.controller';
import { CustomerIntegrationsController } from './customer-integrations.controller';
import { CustomerIntegrationsService } from './customer-integrations.service';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerIntegration, CustomerIntegrationEvent])],
  controllers: [CustomerIntegrationsController, CustomerIntegrationIngestController, CustomerIntegrationEventsController],
  providers: [CustomerIntegrationsService, CustomerIntegrationEventsService],
})
export class CustomerIntegrationsModule {}
