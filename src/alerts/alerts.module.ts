import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Alert } from './alerts.entity';
import { AlertsService } from './alerts.service';
import { AlertsController } from './alerts.controller';
import { AlertNotifier } from './alert-notifier';
import { NotificationsClient } from '../common/notifications/notifications.client';
import { MonitoringIngestGuard } from '../auth/monitoring-ingest.guard';
import { HealthWatcher } from './health-watcher';
import { ServicesModule } from '../services/services.module';
import { LoggingService } from '../common/logging/logging.service';

@Module({
  imports: [TypeOrmModule.forFeature([Alert]), ServicesModule],
  controllers: [AlertsController],
  providers: [AlertsService, AlertNotifier, NotificationsClient, MonitoringIngestGuard, HealthWatcher, LoggingService],
  exports: [AlertsService, AlertNotifier],
})
export class AlertsModule {}
