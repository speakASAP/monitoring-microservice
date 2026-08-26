import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { AlertsModule } from '../alerts/alerts.module';
import { LoggingService } from '../common/logging/logging.service';
import { NotificationsClient } from '../common/notifications/notifications.client';

@Module({
  imports: [AlertsModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, LoggingService, NotificationsClient],
})
export class WebhooksModule {}
