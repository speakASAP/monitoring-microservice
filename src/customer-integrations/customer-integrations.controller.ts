import { Body, Controller, Delete, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { MonitoringAuthGuard } from '../auth/monitoring-auth.guard';
import { CustomerIntegrationsService } from './customer-integrations.service';
import { CreateCustomerIntegrationDto } from './dto/create-customer-integration.dto';
import { UpdateCustomerIntegrationDto } from './dto/update-customer-integration.dto';

@Controller('api/customer/integrations')
@UseGuards(MonitoringAuthGuard)
export class CustomerIntegrationsController {
  constructor(private readonly service: CustomerIntegrationsService) {}

  @Get()
  list(@Request() req) {
    return this.service.list(req.user);
  }

  @Post()
  create(@Request() req, @Body() dto: CreateCustomerIntegrationDto) {
    return this.service.create(req.user, dto);
  }

  @Patch(':id')
  update(@Request() req, @Param('id') id: string, @Body() dto: UpdateCustomerIntegrationDto) {
    return this.service.update(req.user, id, dto);
  }

  @Post(':id/rotate-key')
  rotateKey(@Request() req, @Param('id') id: string) {
    return this.service.rotateKey(req.user, id);
  }

  @Delete(':id')
  remove(@Request() req, @Param('id') id: string) {
    return this.service.remove(req.user, id);
  }
}
