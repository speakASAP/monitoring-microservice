/**
 * When to actually SEND an alert notification, as opposed to when the alert
 * state changed. Pure functions, no I/O, so the thresholds can be tested
 * directly instead of through a live Telegram send.
 *
 * Both rules here exist because of measured production noise between
 * 2026-08-26 and 2026-09-01, when owner-chat volume went from ~6 messages/day
 * to 46/144/71/105/52/104 and the channel stopped being readable. From
 * 2026-08-28 onward, 97-100% of that volume was STILL FAILING repeats from the
 * HealthWatcher sweep, all describing problems that had not changed.
 */

/**
 * How long a resolved alert must stay quiet before its recovery is announced.
 *
 * Measured: of 26 resolved -> fired cycles in that window, 22 re-fired inside
 * ten minutes. Those were never recoveries, so announcing them produced a
 * "RESOLVED" and a fresh "ALERT" for a service that had not changed state in
 * any way the owner cares about.
 */
export const FLAP_WINDOW_MINUTES = Number(process.env.ALERT_FLAP_WINDOW_MINUTES || 10);

/**
 * Minimum gap between successive "STILL FAILING" messages for one alert,
 * indexed by how many times it has fired. Escalating, then capped at 4h.
 *
 * HealthWatcher runs every 5 minutes and used to notify on every tick, so a
 * service down for a day sent 288 identical messages. This schedule sends 8 in
 * the same period: prompt while the problem is new and worth acting on, quiet
 * once it is established and already visible in the digest block.
 */
const REPEAT_BACKOFF_MINUTES = [15, 30, 60, 120, 240];

/** Escalating gap for the Nth repeat, capped at the last entry. */
export function repeatBackoffMinutes(occurrenceCount: number): number {
  const index = Math.max(0, Math.min(occurrenceCount - 2, REPEAT_BACKOFF_MINUTES.length - 1));
  return REPEAT_BACKOFF_MINUTES[index];
}

/**
 * Whether a repeat ("STILL FAILING") message is due.
 *
 * An alert that has never notified always notifies: that is the opening 🚨 and
 * it must never be suppressed. Suppression applies only to re-statements of a
 * problem the channel has already been told about.
 */
export function shouldNotifyRepeat(
  alert: { occurrenceCount?: number | null; lastNotifiedAt?: Date | string | null },
  now: Date = new Date(),
): boolean {
  if (!alert.lastNotifiedAt) return true;

  const last =
    alert.lastNotifiedAt instanceof Date ? alert.lastNotifiedAt : new Date(alert.lastNotifiedAt);
  if (Number.isNaN(last.getTime())) return true;

  const dueAfterMs = repeatBackoffMinutes(alert.occurrenceCount ?? 1) * 60_000;
  return now.getTime() - last.getTime() >= dueAfterMs;
}

/**
 * Whether a re-fire should reopen the pending-resolve alert silently instead of
 * announcing a new outage.
 *
 * True means the service dipped and came back inside the flap window: the
 * original 🚨 was never retracted, so the channel is already correct and the
 * quietest truthful action is to say nothing.
 */
export function isFlapReopen(
  alert: { pendingResolveSince?: Date | string | null },
  now: Date = new Date(),
): boolean {
  if (!alert.pendingResolveSince) return false;

  const since =
    alert.pendingResolveSince instanceof Date
      ? alert.pendingResolveSince
      : new Date(alert.pendingResolveSince);
  if (Number.isNaN(since.getTime())) return false;

  return now.getTime() - since.getTime() < FLAP_WINDOW_MINUTES * 60_000;
}

/** Whether a deferred recovery has now been quiet long enough to announce. */
export function isResolveDue(
  alert: { pendingResolveSince?: Date | string | null },
  now: Date = new Date(),
): boolean {
  if (!alert.pendingResolveSince) return false;
  return !isFlapReopen(alert, now);
}
