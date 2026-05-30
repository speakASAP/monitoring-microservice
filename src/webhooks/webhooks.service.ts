import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlertsService } from '../alerts/alerts.service';
import { LoggingService } from '../common/logging/logging.service';
import axios from 'axios';

@Injectable()
export class WebhooksService {
  constructor(
    private alertsService: AlertsService,
    private loggingService: LoggingService,
    private config: ConfigService,
  ) {}

  async handleAlertmanagerWebhook(payload: any): Promise<void> {
    const alerts = payload.alerts || [];
    for (const a of alerts) {
      const severity = a.labels?.severity || 'warning';
      const alertname = a.labels?.alertname || 'Unknown';
      const service = a.labels?.service || a.labels?.job || 'unknown';
      const message = a.annotations?.description || a.annotations?.summary || alertname;

      if (a.status === 'firing') {
        const alert = await this.alertsService.create({ alertname, service, severity, message });
        await this.loggingService.log('warn', `Alert fired: ${alertname}`, { alertname, service, severity });
        await this.notifyAlert(alert, severity);
      } else if (a.status === 'resolved') {
        await this.loggingService.log('info', `Alert resolved: ${alertname}`, { alertname, service });
      }
    }
  }

  private async notifyAlert(alert: any, severity: string) {
    const url = this.config.get('notifications.url');
    if (!url) return;
    try {
      await axios.post(`${url}/notify`, {
        channel: 'telegram',
        subject: `[${severity.toUpperCase()}] ${alert.alertname}`,
        message: `Service: ${alert.service}\n${alert.message}\nFired: ${alert.firedAt}`,
      }, { timeout: 5000 });
    } catch (err: any) {
      await this.loggingService.log('error', `Failed to send alert notification: ${err.message}`);
    }
  }
}
