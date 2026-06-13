import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerIntegration } from './customer-integration.entity';
import { CustomerIntegrationsController } from './customer-integrations.controller';
import { CustomerIntegrationsService } from './customer-integrations.service';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerIntegration])],
  controllers: [CustomerIntegrationsController],
  providers: [CustomerIntegrationsService],
})
export class CustomerIntegrationsModule {}
