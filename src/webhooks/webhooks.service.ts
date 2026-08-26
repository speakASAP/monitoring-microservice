import { Injectable, Logger } from '@nestjs/common';
import { AlertsService } from '../alerts/alerts.service';
import { AlertNotifier } from '../alerts/alert-notifier';
import { NotificationsClient } from '../common/notifications/notifications.client';
import { LoggingService } from '../common/logging/logging.service';

/**
 * Receives Alertmanager webhooks and drives the alert lifecycle.
 *
 * Three defects fixed here on 2026-08-26, all of which hid failures rather than
 * reporting them:
 *
 *   1. `resolved` events were received and only logged. The Alertmanager config
 *      has had `send_resolved: true` since 2026-05-30, so recovery events have
 *      been arriving for three months and being thrown away — nothing was ever
 *      closed, and monitoring.alerts reached 326,745 rows with zero resolved.
 *   2. `if (!url) return;` silently did nothing when the notifications URL was
 *      unset — a muted alerting system that looked healthy.
 *   3. Notifications were POSTed to `${url}/notify` with no Authorization
 *      header. The real endpoint is `/notifications/send` and it requires a
 *      bearer token, so EVERY notification 404'd into a catch block that logged
 *      where nobody was looking. No Alertmanager alert has ever reached
 *      Telegram. Now routed through the shared NotificationsClient, the same
 *      one the working daily digest uses.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private alertsService: AlertsService,
    private notifier: AlertNotifier,
    private notifications: NotificationsClient,
    private loggingService: LoggingService,
  ) {}

  async handleAlertmanagerWebhook(payload: any): Promise<void> {
    const alerts = payload?.alerts;
    if (!Array.isArray(alerts)) {
      // Never silently accept a payload we did not understand: a shape change
      // in Alertmanager would otherwise mute the entire alerting pipeline while
      // still returning 200.
      await this.loggingService.log('error', 'alertmanager_webhook_malformed', {
        received: typeof alerts,
        keys: payload && typeof payload === 'object' ? Object.keys(payload) : null,
      });
      throw new Error('Alertmanager webhook payload has no alerts[] array');
    }

    for (const a of alerts) {
      if (a?.status === 'firing') {
        await this.handleFiring(a);
      } else if (a?.status === 'resolved') {
        await this.handleResolved(a);
      } else {
        await this.loggingService.log('warn', 'alertmanager_alert_unknown_status', {
          status: a?.status ?? null,
          alertname: a?.labels?.alertname ?? null,
        });
      }
    }
  }

  private async handleFiring(a: any): Promise<void> {
    const severity = a.labels?.severity || 'warning';
    const alertname = a.labels?.alertname || 'Unknown';
    const service = a.labels?.service || a.labels?.job || 'unknown';
    const message = a.annotations?.description || a.annotations?.summary || alertname;

    const { transition, alert } = await this.alertsService.fire({
      alertname,
      service,
      severity,
      message,
      // Alertmanager's stable hash of the label set — the dedup identity. Without
      // it, `repeat_interval: 4h` inserts a fresh row every four hours forever.
      fingerprint: a.fingerprint ?? null,
      labels: a.labels ? JSON.stringify(a.labels) : undefined,
    });

    await this.loggingService.log('warn', `Alert ${transition}: ${alertname}`, {
      alertname,
      service,
      severity,
      transition,
      occurrenceCount: alert.occurrenceCount,
    });

    const active = await this.alertsService.findActive();
    const text =
      transition === 'fired'
        ? this.notifier.formatFired(alert, active)
        : this.notifier.formatRepeat(alert, active);

    await this.send(text, { alertname, service, transition });
  }

  private async handleResolved(a: any): Promise<void> {
    const alertname = a.labels?.alertname || 'Unknown';
    const service = a.labels?.service || a.labels?.job || 'unknown';
    const fingerprint = a.fingerprint ?? null;

    if (!fingerprint) {
      // Without a fingerprint there is no safe way to know WHICH alert cleared.
      // Say so loudly rather than guessing and closing the wrong one.
      await this.loggingService.log('error', 'alertmanager_resolve_without_fingerprint', {
        alertname,
        service,
      });
      return;
    }

    const { transition, alert } = await this.alertsService.resolveByFingerprint(fingerprint);

    if (transition === 'noop' || !alert) {
      // Alertmanager re-sends resolves; one for an alert we never recorded is
      // normal and must NOT produce a "recovered" message for a service that
      // was never reported down.
      await this.loggingService.log('info', 'alert_resolve_noop', { alertname, service, fingerprint });
      return;
    }

    await this.loggingService.log('info', `Alert resolved: ${alertname}`, { alertname, service });

    const active = await this.alertsService.findActive();
    await this.send(this.notifier.formatResolved(alert, active), {
      alertname,
      service,
      transition: 'resolved',
    });
  }

  /**
   * Delivery failures are logged at error level with full context and rethrown.
   * An alerting system that cannot deliver is itself an incident; swallowing
   * that is the precise failure mode this class already suffered for months.
   */
  private async send(message: string, context: Record<string, unknown>): Promise<void> {
    try {
      await this.notifications.sendTelegram(message);
    } catch (err: any) {
      const detail = {
        ...context,
        error: err?.message ?? String(err),
        status: err?.response?.status ?? null,
        body: typeof err?.response?.data === 'string' ? err.response.data.slice(0, 500) : null,
      };
      this.logger.error(`[WebhooksService] alert notification FAILED: ${JSON.stringify(detail)}`);
      await this.loggingService.log('error', 'alert_notification_failed', detail);
      throw err;
    }
  }
}
