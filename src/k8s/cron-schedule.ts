/**
 * How long a CronJob is allowed to go without succeeding, derived from its own
 * schedule.
 *
 * The job watcher alerts on `now - lastSuccessfulTime > N x interval`, so it
 * needs the interval. Getting it from the schedule rather than configuring it
 * per job matters: a hand-maintained table of expected intervals is one more
 * thing that can silently disagree with reality, which is the class of defect
 * this whole lane exists to remove.
 *
 * Pure functions, no I/O, so the arithmetic can be tested against the real
 * schedules in the cluster instead of through a live poll.
 *
 * This is deliberately NOT a general cron evaluator. It answers one question --
 * what is the longest gap between two consecutive runs -- and answers it
 * conservatively when it cannot be sure. A wrong-but-large interval delays an
 * alert; a wrong-but-small one invents alerts for jobs that are fine. Only the
 * second failure mode gets a channel muted, so every fallback here rounds up.
 */

/** Expand one cron field (`*`, `5`, `1,2`, `2-57/5`, `*\/15`) into its values. */
export function expandField(field: string, min: number, max: number): number[] {
  const values = new Set<number>();

  for (const part of field.split(',')) {
    const [range, stepRaw] = part.split('/');
    const step = stepRaw ? Number(stepRaw) : 1;
    if (!Number.isFinite(step) || step <= 0) continue;

    let from = min;
    let to = max;

    if (range !== '*' && range !== '') {
      if (range.includes('-')) {
        const [a, b] = range.split('-').map(Number);
        if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
        from = a;
        to = b;
      } else {
        const single = Number(range);
        if (!Number.isFinite(single)) continue;
        from = single;
        // A bare value with a step (`5/10`) means "from 5 onwards", not "5".
        to = stepRaw ? max : single;
      }
    }

    for (let v = from; v <= to; v += step) {
      if (v >= min && v <= max) values.add(v);
    }
  }

  return [...values].sort((a, b) => a - b);
}

/**
 * The longest gap in minutes between two consecutive runs of a cron schedule.
 *
 * Returns null when the schedule cannot be read, so callers can fall back
 * explicitly rather than silently treating an unparsed schedule as "every
 * minute" -- which would alert on everything.
 */
export function maxIntervalMinutes(schedule: string): number | null {
  const fields = String(schedule || '').trim().split(/\s+/);
  if (fields.length !== 5) return null;

  const [minuteField, hourField, domField, monthField, dowField] = fields;

  const minutes = expandField(minuteField, 0, 59);
  const hours = expandField(hourField, 0, 23);
  if (minutes.length === 0 || hours.length === 0) return null;

  // Day-of-month, month and day-of-week restrict which DAYS run, not which
  // times within a day. Rather than evaluate a calendar, bound the gap: a
  // schedule that skips days cannot have a gap shorter than the daily one, and
  // the widest common case (weekly) is 7 days. Conservative on purpose -- see
  // the file header on which direction is safe to be wrong in.
  const restrictsDays = domField !== '*' || monthField !== '*' || dowField !== '*';

  // Every run time in one day, in minutes past midnight.
  const runTimes: number[] = [];
  for (const h of hours) {
    for (const m of minutes) runTimes.push(h * 60 + m);
  }
  runTimes.sort((a, b) => a - b);

  if (runTimes.length === 1) {
    // Once a day at a fixed time, or once a week if days are restricted.
    return restrictsDays ? 7 * 24 * 60 : 24 * 60;
  }

  let widest = 0;
  for (let i = 1; i < runTimes.length; i += 1) {
    widest = Math.max(widest, runTimes[i] - runTimes[i - 1]);
  }
  // The wrap from the last run of one day to the first of the next.
  widest = Math.max(widest, 24 * 60 - runTimes[runTimes.length - 1] + runTimes[0]);

  if (restrictsDays) {
    // Runs several times on the days it runs, but those days are not every day.
    // The real gap is dominated by the skipped days, not by the within-day
    // spacing.
    return Math.max(widest, 7 * 24 * 60);
  }

  return widest;
}

/**
 * Conservative fallback for a schedule this module cannot parse.
 *
 * A day is long enough that no real job is falsely reported overdue, and short
 * enough that a genuinely dead job is still caught within a day rather than
 * never.
 */
export const UNPARSEABLE_SCHEDULE_FALLBACK_MINUTES = 24 * 60;

/** Interval to use for overdue arithmetic, always defined. */
export function intervalMinutesOrFallback(schedule: string): number {
  return maxIntervalMinutes(schedule) ?? UNPARSEABLE_SCHEDULE_FALLBACK_MINUTES;
}
