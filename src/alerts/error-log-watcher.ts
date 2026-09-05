import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AlertsService } from './alerts.service';
import { AlertNotifier } from './alert-notifier';
import { NotificationsClient } from '../common/notifications/notifications.client';
import { LoggingService } from '../common/logging/logging.service';
import { HeartbeatService } from './heartbeat.service';
import { buildFingerprint } from './fingerprint';
import { LogReadClient, ErrorGroup } from '../common/logging/log-read.client';

const ERROR_WATCH_CRON = process.env.ERROR_WATCH_CRON || '*/5 * * * *';
export const ERROR_LOG_WATCHER_NAME = 'error-log-watcher';
const ERROR_WATCH_INTERVAL_MINUTES = 5;

/** How far back each sweep looks. */
const WINDOW_MINUTES = Number(process.env.ERROR_WINDOW_MINUTES || 60);

/**
 * Occurrences of one signature before it is worth an alert.
 *
 * Not 1. A single error line is frequently a transient the service already
 * retried past, and the CronJob lane measured roughly five transient failures
 * per persistent one. A channel carrying that ratio gets muted, and a muted
 * channel is how the original incident stayed invisible for four days.
 * Repetition is the cheapest available evidence that something is actually
 * stuck rather than briefly unhappy.
 */
const MIN_OCCURRENCES = Number(process.env.ERROR_MIN_OCCURRENCES || 3);

/** Count at which a repeating error stops being a warning. */
const CRITICAL_OCCURRENCES = Number(process.env.ERROR_CRITICAL_OCCURRENCES || 50);

/** Services whose errors are known noise. Empty by default: silence must be chosen explicitly. */
const IGNORED_SERVICES = new Set(
  (process.env.ERROR_IGNORED_SERVICES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

/**
 * Alerts on services that are logging errors.
 *
 * HealthWatcher answers "is the process up", JobWatcher answers "did the
 * scheduled work run". Neither answers "is it up, running, and failing at what
 * it does" -- a service returning 500s on every request has a passing /health
 * and no CronJob. That gap is why backups-microservice reported
 * "Backup run failed: Nightly PostgreSQL backup" on 2026-08-31 and nobody
 * heard about it.
 *
 * Reads the in-memory error index rather than querying log files. See
 * LogReadClient for why polling /api/logs/query would have caused a larger
 * outage than the one it was meant to detect.
 */
@Injectable()
export class ErrorLogWatcher {
  private readonly logger = new Logger(ErrorLogWatcher.name);
  /** Fingerprints alerted on in the previous sweep, to detect recovery. */
  private active = new Set<string>();

  constructor(
    private readonly logs: LogReadClient,
    private readonly alerts: AlertsService,
    private readonly notifier: AlertNotifier,
    private readonly notifications: NotificationsClient,
    private readonly logging: LoggingService,
    private readonly heartbeat: HeartbeatService,
  ) {
    this.heartbeat.register(ERROR_LOG_WATCHER_NAME, ERROR_WATCH_INTERVAL_MINUTES);
  }

  @Cron(ERROR_WATCH_CRON)
  async scheduledCheck(): Promise<void> {
    if (process.env.ERROR_WATCH_ENABLED === 'false') return;
    await this.runCheck();
  }

  async runCheck(now: Date = new Date()): Promise<void> {
    if (!this.logs.hasCredential()) {
      // No credential is a coverage gap, not a healthy state. Do not beat: the
      // heartbeat must age this into a WatcherSilent alert rather than let a
      // permanently blind watcher look alive.
      this.logger.warn('[ErrorLogWatcher] no read credential — skipping');
      return;
    }

    try {
      const summary = await this.logs.fetchErrorSummary(WINDOW_MINUTES);
      if (!summary) {
        // Could not ask. Explicitly not treated as "no errors": resolving
        // alerts here would announce recovery on the strength of a failed
        // request.
        this.heartbeat.fail(ERROR_LOG_WATCHER_NAME, 'error-summary unavailable');
        return;
      }

      // FAIL CLOSED ON A COLD INDEX.
      //
      // The index lives in memory and is emptied by a restart. Immediately
      // after one it honestly reports zero errors, which is indistinguishable
      // from a healthy ecosystem unless the observation window is checked. If
      // this resolved alerts on that basis it would announce recovery for
      // everything currently broken, every time logging-microservice restarts
      // -- and worst of all, a restart caused by a service failing hard would
      // clear the very alerts describing it.
      const indexedSince = new Date(summary.indexedSince);
      const observedMinutes = (now.getTime() - indexedSince.getTime()) / 60000;
      const trustResolution = observedMinutes >= WINDOW_MINUTES;

      const seen = new Set<string>();

      for (const group of summary.groups) {
        try {
          if (IGNORED_SERVICES.has(group.service)) continue;
          if (group.count < MIN_OCCURRENCES) continue;

          const fingerprint = this.fingerprintFor(group);
          seen.add(fingerprint);
          await this.handleGroup(group, fingerprint, summary.truncated);
        } catch (err: any) {
          // One bad group must never abort the sweep; that would let a single
          // malformed entry hide every other failing service.
          this.logger.error(
            `[ErrorLogWatcher] processing ${group.service} failed: ${err?.message ?? String(err)}`,
          );
        }
      }

      if (trustResolution) {
        for (const fingerprint of this.active) {
          if (seen.has(fingerprint)) continue;
          await this.alerts.resolveByFingerprint(fingerprint);
        }
        this.active = seen;
      } else {
        // Keep watching what was already known to be broken, so nothing is
        // forgotten while the index is still filling.
        for (const f of seen) this.active.add(f);
        this.logger.debug(
          `[ErrorLogWatcher] index only ${Math.round(observedMinutes)}m old — not resolving yet`,
        );
      }

      this.heartbeat.beat(ERROR_LOG_WATCHER_NAME);
    } catch (err: any) {
      const detail = err?.message ?? String(err);
      this.logger.error(`[ErrorLogWatcher] sweep failed: ${detail}`);
      await this.logging.log('error', 'error_log_sweep_failed', { error: detail });
      this.heartbeat.fail(ERROR_LOG_WATCHER_NAME, detail);
    }
  }

  private fingerprintFor(group: ErrorGroup): string {
    return buildFingerprint('errorlog', group.service, group.signature);
  }

  private async handleGroup(
    group: ErrorGroup,
    fingerprint: string,
    truncated: boolean,
  ): Promise<void> {
    const severity =
      group.level === 'fatal' || group.count >= CRITICAL_OCCURRENCES ? 'critical' : 'warning';

    const countText = truncated ? `at least ${group.count}` : `${group.count}`;
    const message =
      `${group.service} logged ${countText} ${group.level} event(s) since ` +
      `${group.firstSeen} (most recent ${group.lastSeen}).\n` +
      `Sample: ${group.sampleMessage}`;

    const { transition, alert, notify } = await this.alerts.fire({
      alertname: 'ServiceLoggingErrors',
      service: group.service,
      severity,
      message,
      fingerprint,
      labels: JSON.stringify({
        kind: 'errorlog',
        service: group.service,
        level: group.level,
        signature: group.signature,
        count: group.count,
        firstSeen: group.firstSeen,
        lastSeen: group.lastSeen,
        countIsFloor: truncated,
        sampleMessage: group.sampleMessage,
      }),
    });

    if (!notify) return;

    const active = await this.alerts.findActive();
    const text =
      transition === 'repeat'
        ? this.notifier.formatRepeat(alert, active)
        : this.notifier.formatFired(alert, active);
    await this.notifications.sendTelegram(text);
  }
}
