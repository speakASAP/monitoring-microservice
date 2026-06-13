import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { AuthConsumerService } from './auth-consumer.service';
import { MonitoringAuthGuard } from './monitoring-auth.guard';

@Controller('api/auth')
export class SessionController {
  constructor(private readonly auth: AuthConsumerService) {}

  @Get('session')
  @UseGuards(MonitoringAuthGuard)
  session(@Request() req) {
    return { user: req.user, isAdmin: this.auth.isMonitoringAdmin(req.user) };
  }
}
