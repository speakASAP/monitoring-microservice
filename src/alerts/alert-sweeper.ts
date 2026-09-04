import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AlertsService } from './alerts.service';
import { AlertNotifier } from './alert-notifier';
import { NotificationsClient } from '../common/notifications/notifications.client';
import { LoggingService } from '../common/logging/logging.service';
import { FLAP_WINDOW_MINUTES } from './alert-policy';

const SWEEP_CRON = process.env.ALERT_SWEEP_CRON || '* * * * *';

/**
 * Delivers the recovery messages that resolve deliberately withheld.
 *
 * A resolve marks its alert resolved at once but only *owes* the ✅ message;
 * this sweeper pays that debt after the service has stayed quiet for the flap
 * window. If the alert re-fires first, AlertsService.fire() reopens the row and
 * clears the debt, so the cycle produces no message at all.
 *
 * That withholding is the entire point: between 2026-08-26 and 2026-09-01 there
 * were 26 resolved -> fired cycles, 22 of them inside ten minutes, and each one
 * sent a ✅ immediately followed by a fresh 🚨 about a service whose real state
 * had not changed.
 *
 * Runs every minute so a genuine recovery is announced within roughly a minute
 * of the window closing. The delay applies only to good news; an opening 🚨 is
 * never deferred.
 */
@Injectable()
export class AlertSweeper {
  private readonly logger = new Logger(AlertSweeper.name);

  constructor(
    private readonly alerts: AlertsService,
    private readonly notifier: AlertNotifier,
    private readonly notifications: NotificationsClient,
    private readonly logging: LoggingService,
  ) {}

  @Cron(SWEEP_CRON)
  async scheduledSweep(): Promise<void> {
    if (process.env.ALERT_SWEEP_ENABLED === 'false') return;
    await this.flushDueResolves();
  }

  async flushDueResolves(now: Date = new Date()): Promise<number> {
    let due;
    try {
      due = await this.alerts.findDueResolves(now);
    } catch (err: any) {
      this.logger.error(
        `[AlertSweeper] could not load due recoveries: ${err?.message ?? String(err)}`,
      );
      return 0;
    }

    if (due.length === 0) return 0;

    const active = await this.alerts.findActive();
    let sent = 0;

    for (const alert of due) {
      // One alert's failure must not strand every other owed recovery: a row
      // left with pendingResolveSince set is simply retried next minute, which
      // is why the flag is cleared only after a successful send.
      try {
        await this.notifications.sendTelegram(this.notifier.formatResolved(alert, active, now));
        await this.alerts.markResolveNotified(alert.id, now);
        sent += 1;
      } catch (err: any) {
        this.logger.error(
          `[AlertSweeper] delivering recovery for ${alert.service} failed, will retry: ${err?.message ?? String(err)}`,
        );
      }
    }

    if (sent > 0) {
      await this.logging.log('info', 'deferred_recoveries_sent', {
        count: sent,
        flapWindowMinutes: FLAP_WINDOW_MINUTES,
      });
    }

    return sent;
  }
}
