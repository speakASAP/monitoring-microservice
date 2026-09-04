import { repeatBackoffMinutes, shouldNotifyRepeat, isFlapReopen, isResolveDue } from './alert-policy';

/**
 * These thresholds are the whole noise-reduction lane, so they are tested
 * directly rather than through a live send.
 *
 * Measured owner-chat volume 2026-08-26 .. 2026-09-01: 46/144/71/105/52/104
 * messages/day against a ~6/day baseline. From 2026-08-28 onward 97-100% of it
 * was STILL FAILING repeats from the 5-minute HealthWatcher sweep, each
 * restating a problem that had not changed.
 */
describe('alert notification policy', () => {
  describe('repeat backoff', () => {
    it('escalates and then caps at 4h', () => {
      expect(repeatBackoffMinutes(2)).toBe(15);
      expect(repeatBackoffMinutes(3)).toBe(30);
      expect(repeatBackoffMinutes(4)).toBe(60);
      expect(repeatBackoffMinutes(5)).toBe(120);
      expect(repeatBackoffMinutes(6)).toBe(240);
      expect(repeatBackoffMinutes(99)).toBe(240);
    });

    it('never returns a gap below the 5-minute HealthWatcher tick', () => {
      // A backoff shorter than the tick would be no backoff at all.
      for (let n = 2; n < 50; n += 1) {
        expect(repeatBackoffMinutes(n)).toBeGreaterThan(5);
      }
    });

    it('an alert that has never notified always notifies', () => {
      // This is the opening 🚨. Suppressing it would hide an outage, which is
      // the opposite of the goal.
      expect(shouldNotifyRepeat({ occurrenceCount: 1, lastNotifiedAt: null })).toBe(true);
    });

    it('suppresses a repeat inside the backoff window', () => {
      const now = new Date('2026-09-04T12:00:00Z');
      const justNow = new Date('2026-09-04T11:55:00Z'); // one 5-minute tick ago
      expect(shouldNotifyRepeat({ occurrenceCount: 2, lastNotifiedAt: justNow }, now)).toBe(false);
    });

    it('sends the repeat once the window has elapsed', () => {
      const now = new Date('2026-09-04T12:00:00Z');
      const longAgo = new Date('2026-09-04T11:40:00Z'); // 20m > the 15m gap
      expect(shouldNotifyRepeat({ occurrenceCount: 2, lastNotifiedAt: longAgo }, now)).toBe(true);
    });

    it('collapses a day-long outage from 288 messages to single digits', () => {
      // HealthWatcher ticks every 5 minutes: 288 ticks in 24h, and every one of
      // them used to send.
      const start = new Date('2026-09-04T00:00:00Z').getTime();
      let lastNotifiedAt: Date | null = null;
      let occurrenceCount = 1;
      let sent = 0;

      for (let tick = 0; tick < 288; tick += 1) {
        const now = new Date(start + tick * 5 * 60_000);
        occurrenceCount += 1;
        if (shouldNotifyRepeat({ occurrenceCount, lastNotifiedAt }, now)) {
          sent += 1;
          lastNotifiedAt = now;
        }
      }

      expect(sent).toBeLessThanOrEqual(10);
      expect(sent).toBeGreaterThan(0);
    });
  });

  describe('flap damping', () => {
    it('an alert with no pending resolve is not a flap reopen', () => {
      expect(isFlapReopen({ pendingResolveSince: null })).toBe(false);
    });

    it('treats a re-fire inside the window as a flap', () => {
      const now = new Date('2026-09-04T12:00:00Z');
      // The measured mean gap between resolve and re-fire was 429s.
      const resolvedAt = new Date('2026-09-04T11:52:51Z');
      expect(isFlapReopen({ pendingResolveSince: resolvedAt }, now)).toBe(true);
      expect(isResolveDue({ pendingResolveSince: resolvedAt }, now)).toBe(false);
    });

    it('a recovery that outlasts the window is due, not a flap', () => {
      const now = new Date('2026-09-04T12:00:00Z');
      const resolvedAt = new Date('2026-09-04T11:45:00Z'); // 15m > 10m window
      expect(isFlapReopen({ pendingResolveSince: resolvedAt }, now)).toBe(false);
      expect(isResolveDue({ pendingResolveSince: resolvedAt }, now)).toBe(true);
    });

    it('nothing is owed when no resolve is pending', () => {
      // Stale expiry and already-announced recoveries both land here. Getting
      // this wrong would announce 236 expired alerts at once.
      expect(isResolveDue({ pendingResolveSince: null })).toBe(false);
    });

    it('a corrupt timestamp fails open rather than trapping a recovery forever', () => {
      expect(isFlapReopen({ pendingResolveSince: 'not-a-date' })).toBe(false);
      expect(shouldNotifyRepeat({ occurrenceCount: 2, lastNotifiedAt: 'not-a-date' })).toBe(true);
    });
  });
});
