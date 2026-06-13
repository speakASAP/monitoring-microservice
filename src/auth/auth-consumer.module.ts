import { Global, Module } from '@nestjs/common';
import { AuthConsumerService } from './auth-consumer.service';
import { MonitoringAuthGuard } from './monitoring-auth.guard';
import { MonitoringAdminGuard } from './monitoring-admin.guard';

@Global()
@Module({
  providers: [AuthConsumerService, MonitoringAuthGuard, MonitoringAdminGuard],
  exports: [AuthConsumerService, MonitoringAuthGuard, MonitoringAdminGuard],
})
export class AuthConsumerModule {}
