import {
  expandField,
  maxIntervalMinutes,
  intervalMinutesOrFallback,
  UNPARSEABLE_SCHEDULE_FALLBACK_MINUTES,
} from './cron-schedule';

describe('expandField', () => {
  it('expands a wildcard', () => {
    expect(expandField('*', 0, 5)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('expands a list', () => {
    expect(expandField('14,44', 0, 59)).toEqual([14, 44]);
  });

  it('expands a stepped range', () => {
    expect(expandField('2-57/5', 0, 59)).toEqual([2, 7, 12, 17, 22, 27, 32, 37, 42, 47, 52, 57]);
  });

  it('expands a stepped wildcard', () => {
    expect(expandField('*/15', 0, 59)).toEqual([0, 15, 30, 45]);
  });

  it('treats a bare value as a single value, not an open range', () => {
    expect(expandField('23', 0, 23)).toEqual([23]);
  });

  it('treats a stepped bare value as "from here onwards"', () => {
    expect(expandField('9/15', 0, 59)).toEqual([9, 24, 39, 54]);
  });

  it('ignores junk instead of throwing', () => {
    expect(expandField('not-a-number', 0, 59)).toEqual([]);
  });
});

/**
 * Every schedule below is a real CronJob in statex-apps, measured 2026-09-05.
 * If this table stops matching the cluster the watcher's arithmetic is wrong,
 * which is worth a failing test rather than a quietly mistimed alert.
 */
describe('maxIntervalMinutes — against the live cluster schedules', () => {
  const live: Array<[string, string, number]> = [
    ['catalog-contract-monitor', '14,44 * * * *', 30],
    ['cliplot-readiness-monitor', '19,49 * * * *', 30],
    ['domain-research-expiry-recheck', '2-57/5 * * * *', 5],
    ['domain-research-notification-dispatch', '9-59/15 * * * *', 15],
    ['pod-janitor', '*/15 * * * *', 15],
    ['warehouse-reservation-expiry', '3-58/5 * * * *', 5],
    ['marketing-order-affinity-allegro-daily', '23 2 * * *', 1440],
    ['marketing-order-affinity-aukro-daily', '50 14 * * *', 1440],
    ['marketing-order-affinity-bazos-daily', '0 23 * * *', 1440],
    ['marketing-order-affinity-central-orders-backfill', '20 3 * * *', 1440],
    ['speakasap-lesson-record-sync', '20 2 * * *', 1440],
  ];

  it.each(live)('%s (%s) -> %i minutes', (_name, schedule, expected) => {
    expect(maxIntervalMinutes(schedule)).toBe(expected);
  });
});

describe('maxIntervalMinutes — edge cases', () => {
  it('measures the wrap across midnight, not just within-day gaps', () => {
    // 01:00 and 02:00 only: the real gap is the 23h wrap, not the 1h spacing.
    expect(maxIntervalMinutes('0 1,2 * * *')).toBe(23 * 60);
  });

  it('uses the widest gap when spacing is uneven', () => {
    expect(maxIntervalMinutes('0,5 * * * *')).toBe(55);
  });

  it('treats every minute as one minute', () => {
    expect(maxIntervalMinutes('* * * * *')).toBe(1);
  });

  it('bounds a weekly schedule at seven days rather than reporting a daily gap', () => {
    // Sunday 04:00 — the docker prune entry. Reporting 1440 here would alert
    // six days early, every week.
    expect(maxIntervalMinutes('0 4 * * 0')).toBe(7 * 24 * 60);
  });

  it('bounds a day-of-month schedule the same way', () => {
    expect(maxIntervalMinutes('0 3 1 * *')).toBe(7 * 24 * 60);
  });

  it('rounds a multi-run-per-day-but-not-every-day schedule up, never down', () => {
    // Runs hourly, but only on Mondays. The within-day gap of 60 minutes is a
    // dangerous answer: it would alert every Monday evening.
    expect(maxIntervalMinutes('0 * * * 1')).toBe(7 * 24 * 60);
  });

  it('returns null for a schedule it cannot read', () => {
    expect(maxIntervalMinutes('nonsense')).toBeNull();
    expect(maxIntervalMinutes('* * * *')).toBeNull();
    expect(maxIntervalMinutes('')).toBeNull();
  });
});

describe('intervalMinutesOrFallback', () => {
  it('falls back to a full day rather than to a short interval', () => {
    // The direction matters: falling back to a small number would invent
    // alerts for every job whose schedule this module cannot parse.
    expect(intervalMinutesOrFallback('@weekly')).toBe(UNPARSEABLE_SCHEDULE_FALLBACK_MINUTES);
    expect(UNPARSEABLE_SCHEDULE_FALLBACK_MINUTES).toBe(1440);
  });

  it('uses the parsed interval when it can read the schedule', () => {
    expect(intervalMinutesOrFallback('14,44 * * * *')).toBe(30);
  });
});
