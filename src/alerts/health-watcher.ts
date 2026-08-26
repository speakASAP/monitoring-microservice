import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ServicesService } from '../services/services.service';
import { AlertsService } from './alerts.service';
import { AlertNotifier } from './alert-notifier';
import { NotificationsClient } from '../common/notifications/notifications.client';
import { LoggingService } from '../common/logging/logging.service';

const HEALTH_WATCH_CRON = process.env.HEALTH_WATCH_CRON || '*/5 * * * *';

/**
 * An active alert with no re-fire in this long is treated as over.
 * Alertmanager's repeat_interval is 4h, so this is comfortably past it — high
 * enough that a genuinely-still-firing alert is never expired early.
 */
const STALE_ALERT_MINUTES = Number(process.env.STALE_ALERT_MINUTES || 360);

/**
 * Periodically checks every registered service and drives the alert lifecycle
 * from the result: a service that goes down fires once, and a service that
 * comes back sends the clear event.
 *
 * Before this existed the only recurring health signal was the 08:00 daily
 * digest, so an outage at 08:30 was invisible for 23.5 hours.
 *
 * Only REAL outages alert. A 'config' failureKind means the registry's
 * healthPath is wrong and the service itself is fine (this has caused three
 * separate false-outage incidents — see services.service.spec.ts); alerting on
 * those is exactly the noise that gets a channel muted.
 */
@Injectable()
export class HealthWatcher {
  private readonly logger = new Logger(HealthWatcher.name);

  constructor(
    private readonly services: ServicesService,
    private readonly alerts: AlertsService,
    private readonly notifier: AlertNotifier,
    private readonly notifications: NotificationsClient,
    private readonly logging: LoggingService,
  ) {}

  @Cron(HEALTH_WATCH_CRON)
  async scheduledCheck(): Promise<void> {
    if (process.env.HEALTH_WATCH_ENABLED === 'false') return;
    await this.runCheck();
  }

  async runCheck(): Promise<void> {
    await this.expireStaleAlerts();

    const statuses = await this.services.getServicesStatus();

    for (const svc of statuses) {
      if (!svc.monitorable) continue;

      // One service's failure must never abort the sweep — that would let a
      // single bad row hide every other outage.
      try {
        if (svc.healthy) {
          await this.handleHealthy(svc);
        } else if (svc.failureKind === 'config') {
          // Registry bug, not an outage. Logged, never alerted.
          await this.logging.log('warn', 'health_watch_config_failure', {
            service: svc.name,
            error: svc.error ?? null,
          });
        } else {
          await this.handleUnhealthy(svc);
        }
      } catch (err: any) {
        this.logger.error(
          `[HealthWatcher] processing ${svc.name} failed: ${err?.message ?? String(err)}`,
        );
        await this.logging.log('error', 'health_watch_service_failed', {
          service: svc.name,
          error: err?.message ?? String(err),
        });
      }
    }
  }

  private fingerprintFor(name: string): string {
    return `health:${name}`;
  }

  /**
   * Close alerts nothing has re-fired for far longer than Alertmanager's
   * repeat_interval — their resolve was missed, almost always because this
   * service was down when it arrived.
   *
   * Silent by design. These are not recoveries anyone is waiting to hear about;
   * they are bookkeeping about pods that vanished hours ago, and announcing 236
   * of them at once would be a notification storm. The correction shows up
   * where it matters: the digest stops naming them.
   */
  private async expireStaleAlerts(): Promise<void> {
    const stale = await this.alerts.findStale(STALE_ALERT_MINUTES);
    if (stale.length === 0) return;

    let expired = 0;
    for (const alert of stale) {
      if (!alert.fingerprint) continue;
      try {
        const { transition } = await this.alerts.resolveByFingerprint(alert.fingerprint);
        if (transition === 'resolved') expired += 1;
      } catch (err: any) {
        this.logger.error(
          `[HealthWatcher] expiring stale alert ${alert.fingerprint} failed: ${err?.message ?? String(err)}`,
        );
      }
    }

    if (expired > 0) {
      this.logger.log(`[HealthWatcher] expired ${expired} stale alert(s) — no re-fire in ${STALE_ALERT_MINUTES}m`);
      await this.logging.log('info', 'stale_alerts_expired', { count: expired, thresholdMinutes: STALE_ALERT_MINUTES });
    }
  }

  private async handleUnhealthy(svc: any): Promise<void> {
    const { transition, alert } = await this.alerts.fire({
      alertname: 'ServiceUnhealthy',
      service: svc.name,
      severity: svc.failureKind === 'unreachable' ? 'critical' : 'warning',
      message: `${svc.name} is ${svc.failureKind ?? 'unhealthy'}: ${svc.error ?? 'no detail'} (${svc.internalUrl ?? 'n/a'})`,
      fingerprint: this.fingerprintFor(svc.name),
    });

    const active = await this.alerts.findActive();
    const message =
      transition === 'fired'
        ? this.notifier.formatFired(alert, active)
        : this.notifier.formatRepeat(alert, active);

    await this.notifications.sendTelegram(message);
  }

  private async handleHealthy(svc: any): Promise<void> {
    const { transition, alert } = await this.alerts.resolveByFingerprint(
      this.fingerprintFor(svc.name),
    );

    // 'noop' is the common case: the service is fine and always was. Silence.
    if (transition !== 'resolved' || !alert) return;

    const active = await this.alerts.findActive();
    await this.notifications.sendTelegram(this.notifier.formatResolved(alert, active));
  }
}
