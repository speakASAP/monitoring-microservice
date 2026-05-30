import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { CreateAlertDto } from './dto/create-alert.dto';
import { AcknowledgeAlertDto } from './dto/acknowledge-alert.dto';

@Controller('api/alerts')
export class AlertsController {
  constructor(private readonly svc: AlertsService) {}

  @Get()
  findAll(@Query('status') status?: string) {
    if (status === 'active') return this.svc.findActive();
    return this.svc.findAll();
  }

  @Post()
  create(@Body() dto: CreateAlertDto) {
    return this.svc.create(dto);
  }

  @Post(':id/acknowledge')
  acknowledge(@Param('id') id: string, @Body() dto: AcknowledgeAlertDto) {
    return this.svc.acknowledge(id, dto);
  }

  @Post(':id/resolve')
  resolve(@Param('id') id: string) {
    return this.svc.resolve(id);
  }
}
