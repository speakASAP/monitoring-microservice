import { Controller, Get, UseGuards } from '@nestjs/common';
import { MonitoringAdminGuard } from '../auth/monitoring-admin.guard';
import { ServicesService } from './services.service';

@Controller('api/services')
@UseGuards(MonitoringAdminGuard)
export class ServicesController {
  constructor(private readonly svc: ServicesService) {}

  @Get()
  getAll() { return this.svc.getServicesStatus(); }

  @Get('list')
  getList() { return this.svc.getEcosystemServices(); }
}
