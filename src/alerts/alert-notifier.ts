import { Injectable } from '@nestjs/common';
import { Alert } from './alerts.entity';

/**
 * How many alerts the digest names before truncating. Chosen so the block stays
 * readable at a glance on a phone; the heading always carries the true count.
 */
const DIGEST_MAX_ENTRIES = 12;

/**
 * Formats fire / repeat / resolve notifications for Telegram.
 *
 * Every message ends with the active-alert digest — the list of what is still
 * failing at this instant. That block is the point of the whole feature: the
 * channel should answer "what is broken right now" on its own, so nobody has to
 * scroll back through three months of alerts to work out whether a 🚨 from this
 * morning was ever cleared.
 *
 * PLAIN TEXT ONLY, no markup. These messages embed pod names, upstream error
 * strings and 25-line deploy log tails. Any parse mode would let a stray '<' in
 * a log tail make Telegram reject the whole message
 * (see shared/scripts/deploy-queue/notify.sh, which sends parseMode "Plain" for
 * the same reason).
 */
@Injectable()
export class AlertNotifier {
  /** Human-readable elapsed time: 45s, 3m, 3h12m, 1d1h. */
  formatDuration(ms: number): string {
    if (ms < 0) ms = 0;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;

    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;

    const h = Math.floor(m / 60);
    if (h < 24) {
      const rem = m % 60;
      return rem ? `${h}h${rem}m` : `${h}h`;
    }

    const d = Math.floor(h / 24);
    const remH = h % 24;
    return remH ? `${d}d${remH}h` : `${d}d`;
  }

  /**
   * The block appended to every message.
   *
   * An empty set prints "All clear" rather than an empty heading — the resolve
   * that empties the list is the most valuable message in the whole system and
   * it should say so unambiguously.
   */
  buildActiveDigest(active: Alert[], now: Date): string {
    if (active.length === 0) {
      return '── All clear — no failing services ──';
    }

    // Oldest first: the longest-running problem is the one most likely to be
    // the cause, and the newest are often just its knock-on effects.
    const sorted = active.slice().sort((a, b) => this.firedAtMs(a) - this.firedAtMs(b));

    const lines = sorted.slice(0, DIGEST_MAX_ENTRIES).map((a) => {
      const age = this.formatDuration(now.getTime() - this.firedAtMs(a));
      const repeats = (a.occurrenceCount ?? 1) > 1 ? ` ×${a.occurrenceCount}` : '';
      return `• ${a.service} — ${a.alertname} — ${age}${repeats}`;
    });

    // A mass outage (an I/O storm opened 238 at once on 2026-08-26) would
    // otherwise append hundreds of lines to EVERY message, which is worse than
    // no digest: nobody reads it and Telegram splits it across messages. The
    // count in the heading always states the true total, so truncation never
    // understates an outage.
    const hidden = sorted.length - lines.length;
    if (hidden > 0) {
      lines.push(`  …and ${hidden} more`);
    }

    return [`── Still failing (${active.length}) ──`, ...lines].join('\n');
  }

  formatFired(alert: Alert, active: Alert[], now: Date = new Date()): string {
    return [
      `🚨 ALERT: ${alert.service}`,
      '',
      `${alert.alertname} (${alert.severity})`,
      alert.message,
      '',
      this.buildActiveDigest(active, now),
    ].join('\n');
  }

  /**
   * Deliberately short. A persisting problem re-fires on every HealthWatcher
   * sweep and a failing deploy re-fires on every commit; resending the full detail body each
   * time is what buries a channel, and a muted channel is worse than no channel.
   */
  formatRepeat(alert: Alert, active: Alert[], now: Date = new Date()): string {
    // Flap suppression makes each dip-and-return invisible on purpose, so the
    // count is stated here instead. An unstable target is a different problem
    // from a steadily-down one and needs a different fix, and this line is now
    // the only place that distinction is visible.
    const flaps = (alert.flapCount ?? 0) > 0 ? `, ${alert.flapCount} flaps` : '';

    return [
      `🔁 STILL FAILING: ${alert.service} — ${alert.alertname} (attempt ${alert.occurrenceCount ?? 1}${flaps})`,
      '',
      this.buildActiveDigest(active, now),
    ].join('\n');
  }

  /**
   * The clear event / recovery notification: the message that retracts an
   * earlier 🚨 so the channel stops implying the service is still down.
   */
  formatResolved(alert: Alert, active: Alert[], now: Date = new Date()): string {
    const resolvedAt =
      alert.resolvedAt instanceof Date ? alert.resolvedAt : alert.resolvedAt ? new Date(alert.resolvedAt) : null;
    const downFor = this.formatDuration((resolvedAt?.getTime() ?? now.getTime()) - this.firedAtMs(alert));

    // Reaching a resolve message at all means the service stayed healthy for
    // the whole flap window, so a non-zero count describes the outage that just
    // ended rather than doubt about the recovery.
    const flaps =
      (alert.flapCount ?? 0) > 0
        ? [`(recovered through ${alert.flapCount} flap${alert.flapCount === 1 ? '' : 's'})`, '']
        : [];

    return [
      `✅ RESOLVED: ${alert.service}`,
      '',
      `${alert.alertname} recovered after ${downFor}`,
      ...flaps,
      '',
      this.buildActiveDigest(active, now),
    ].join('\n');
  }

  private firedAtMs(alert: Alert): number {
    const fired = alert.firedAt instanceof Date ? alert.firedAt : new Date(alert.firedAt);
    return fired.getTime();
  }
}
