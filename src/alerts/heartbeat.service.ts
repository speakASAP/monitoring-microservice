import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AlertsService } from './alerts.service';
import { AlertNotifier } from './alert-notifier';
import { NotificationsClient } from '../common/notifications/notifications.client';
import { LoggingService } from '../common/logging/logging.service';

const HEARTBEAT_CHECK_CRON = process.env.HEARTBEAT_CHECK_CRON || '*/5 * * * *';

/**
 * How many missed cycles before a silent watcher is itself alerted on.
 *
 * Same shape as the job watcher's overdue multiple and for the same reason: one
 * missed cycle is a slow API call, three in a row is a watcher that has stopped.
 */
const MISSED_CYCLES_BEFORE_ALERT = Number(process.env.HEARTBEAT_MISSED_CYCLES || 3);

interface Registration {
  name: string;
  expectedIntervalMinutes: number;
  lastBeatAt: Date;
  lastError: string | null;
}

/**
 * Watches the watchers.
 *
 * Every adapter added by this lane exists to remove a blind spot, which means
 * each one becomes a new blind spot the moment it stops running. That is not
 * hypothetical: the incident that started this work was a monitor that failed
 * for four days while the thing it monitored looked fine, and a job watcher
 * that throws on its first poll every time would reproduce exactly that
 * failure, one level up.
 *
 * So every adapter registers here and beats on each successful cycle. A missing
 * beat is an alert in its own right, through the same fire() path as any other
 * problem.
 *
 * State is in-memory on purpose. A restart clears it and each adapter
 * re-registers with a fresh grace period, which is correct: the question this
 * service answers is "is the watcher running in THIS process", and the case it
 * cannot see -- the whole pod being down -- is already covered, because
 * monitoring-microservice is itself a registered service in the health sweep.
 */
@Injectable()
export class HeartbeatService {
  private readonly logger = new Logger(HeartbeatService.name);
  private readonly registry = new Map<string, Registration>();

  constructor(
    private readonly alerts: AlertsService,
    private readonly notifier: AlertNotifier,
    private readonly notifications: NotificationsClient,
    private readonly logging: LoggingService,
  ) {}

  /**
   * Declare an adapter. Called at construction, before the first cycle runs, so
   * an adapter that dies on its very first poll is still known to exist and is
   * still reported.
   */
  register(name: string, expectedIntervalMinutes: number, now: Date = new Date()): void {
    if (this.registry.has(name)) return;
    this.registry.set(name, {
      name,
      expectedIntervalMinutes,
      // Seeded to now: the adapter gets one full grace window to produce its
      // first beat rather than alerting immediately at boot.
      lastBeatAt: now,
      lastError: null,
    });
  }

  /** Record a completed cycle. */
  beat(name: string, now: Date = new Date()): void {
    const reg = this.registry.get(name);
    if (!reg) return;
    reg.lastBeatAt = now;
    reg.lastError = null;
  }

  /**
   * Record a cycle that threw.
   *
   * Deliberately does NOT refresh the beat. A watcher failing every cycle is
   * running but not working, and must age into the same alert as one that is
   * not running at all -- otherwise "it threw, but promptly" would count as
   * healthy.
   */
  fail(name: string, error: string): void {
    const reg = this.registry.get(name);
    if (!reg) return;
    reg.lastError = error;
  }

  /** Exposed for the status endpoint and for tests. */
  snapshot(now: Date = new Date()): Array<Registration & { ageMinutes: number; silent: boolean }> {
    return [...this.registry.values()].map((reg) => {
      const ageMinutes = (now.getTime() - reg.lastBeatAt.getTime()) / 60000;
      return {
        ...reg,
        ageMinutes,
        silent: ageMinutes > reg.expectedIntervalMinutes * MISSED_CYCLES_BEFORE_ALERT,
      };
    });
  }

  @Cron(HEARTBEAT_CHECK_CRON)
  async scheduledCheck(): Promise<void> {
    if (process.env.HEARTBEAT_CHECK_ENABLED === 'false') return;
    await this.runCheck();
  }

  async runCheck(now: Date = new Date()): Promise<void> {
    for (const entry of this.snapshot(now)) {
      try {
        if (entry.silent) {
          await this.fireSilent(entry);
        } else {
          await this.alerts.resolveByFingerprint(this.fingerprintFor(entry.name));
        }
      } catch (err: any) {
        this.logger.error(
          `[HeartbeatService] checking ${entry.name} failed: ${err?.message ?? String(err)}`,
        );
      }
    }
  }

  private fingerprintFor(name: string): string {
    return `heartbeat:${name}`;
  }

  private async fireSilent(entry: Registration & { ageMinutes: number }): Promise<void> {
    const detail = entry.lastError
      ? `last error: ${entry.lastError}`
      : 'no error recorded — the cycle is not running at all';

    const { transition, alert, notify } = await this.alerts.fire({
      alertname: 'WatcherSilent',
      service: 'monitoring-microservice',
      // Critical without exception. A blind watcher means every surface behind
      // it is unwatched, and the whole point of this lane is that unwatched is
      // the state that costs days.
      severity: 'critical',
      message:
        `${entry.name} has not completed a cycle in ${Math.round(entry.ageMinutes)}m ` +
        `(expected every ${entry.expectedIntervalMinutes}m) — ${detail}`,
      fingerprint: this.fingerprintFor(entry.name),
    });

    await this.logging.log('error', 'watcher_silent', {
      watcher: entry.name,
      ageMinutes: Math.round(entry.ageMinutes),
      lastError: entry.lastError,
    });

    if (!notify) return;

    const active = await this.alerts.findActive();
    const message =
      transition === 'repeat'
        ? this.notifier.formatRepeat(alert, active)
        : this.notifier.formatFired(alert, active);

    await this.notifications.sendTelegram(message);
  }
}
