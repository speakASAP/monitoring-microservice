import { AlertNotifier } from './alert-notifier';
import { Alert } from './alerts.entity';

/**
 * Message-shape tests for fire/resolve notifications.
 *
 * The user-facing requirement these encode: every alert message must end with
 * the CURRENT set of still-failing alerts, so the Telegram channel answers
 * "what is broken right now" without scrolling back through history. A resolve
 * that empties the set must say so explicitly rather than printing an empty
 * heading.
 *
 * Sent as PLAIN text, never HTML: these messages embed pod names, error strings
 * and deploy log tails, and a stray '<' in a log tail must not be able to make
 * Telegram reject the message. (The daily digest at digest.utils.ts does use
 * HTML and escapes accordingly — different channel discipline, same chat.)
 */
describe('AlertNotifier', () => {
  const notifier = new AlertNotifier();

  const alert = (over: Partial<Alert> = {}): Alert =>
    ({
      id: 'a1',
      alertname: 'DeployFailed',
      service: 'payments-microservice',
      severity: 'critical',
      message: 'Exit code: 1',
      status: 'active',
      fingerprint: 'fp-1',
      occurrenceCount: 1,
      firedAt: new Date('2026-08-26T12:00:00Z'),
      lastFiredAt: new Date('2026-08-26T12:00:00Z'),
      resolvedAt: null,
      ...over,
    }) as Alert;

  const at = new Date('2026-08-26T15:12:00Z');

  it('a first firing is loud, names the service, and lists what else is failing', () => {
    const msg = notifier.formatFired(alert(), [alert(), alert({ service: 'marathon', firedAt: new Date('2026-08-26T14:31:00Z') })], at);

    expect(msg).toContain('🚨');
    expect(msg).toContain('payments-microservice');
    expect(msg).toContain('Still failing (2)');
    expect(msg).toContain('marathon');
  });

  it('a repeat is quiet: attempt count, no repeated detail body', () => {
    const first = notifier.formatFired(alert({ message: 'LOG TAIL LINE' }), [alert()], at);
    const repeat = notifier.formatRepeat(alert({ occurrenceCount: 4, message: 'LOG TAIL LINE' }), [alert()], at);

    expect(repeat).toContain('🔁');
    expect(repeat).toContain('attempt 4');
    // The detail already arrived with the first alert; resending it every 4h is
    // what makes a channel unreadable and eventually muted.
    expect(repeat).not.toContain('LOG TAIL LINE');
    expect(repeat.length).toBeLessThan(first.length);
  });

  it('a resolve says how long it was broken and confirms all clear when nothing remains', () => {
    const resolved = alert({ status: 'resolved', resolvedAt: at });
    const msg = notifier.formatResolved(resolved, [], at);

    expect(msg).toContain('✅');
    expect(msg).toContain('payments-microservice');
    expect(msg).toContain('3h12m');            // 12:00 -> 15:12
    expect(msg).toContain('All clear');
    expect(msg).not.toContain('Still failing');
  });

  it('a resolve while other alerts remain lists the remainder instead of All clear', () => {
    const resolved = alert({ status: 'resolved', resolvedAt: at });
    const msg = notifier.formatResolved(resolved, [alert({ service: 'marathon' })], at);

    expect(msg).toContain('Still failing (1)');
    expect(msg).toContain('marathon');
    expect(msg).not.toContain('All clear');
  });

  it('durations read in human units, not raw milliseconds', () => {
    expect(notifier.formatDuration(45_000)).toBe('45s');
    expect(notifier.formatDuration(11_520_000)).toBe('3h12m');
    expect(notifier.formatDuration(180_000)).toBe('3m');
    expect(notifier.formatDuration(90_061_000)).toBe('1d1h');
  });
});
