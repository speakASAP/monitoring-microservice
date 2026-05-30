import { Controller, Get } from '@nestjs/common';
import { ServicesService } from './services.service';

@Controller('api/services')
export class ServicesController {
  constructor(private readonly svc: ServicesService) {}

  @Get()
  getAll() { return this.svc.getServicesStatus(); }

  @Get('list')
  getList() { return this.svc.getEcosystemServices(); }
}
