import { ErrorLogWatcher, ERROR_LOG_WATCHER_NAME } from './error-log-watcher';
import { ErrorSummary, ErrorGroup } from '../common/logging/log-read.client';

function group(over: Partial<ErrorGroup> = {}): ErrorGroup {
  return {
    service: 'backups-microservice',
    level: 'error',
    signature: 'Backup run failed for job <str>',
    count: 5,
    firstSeen: '2026-09-05T10:00:00.000Z',
    lastSeen: '2026-09-05T11:00:00.000Z',
    sampleMessage: 'Backup run failed for job "Nightly PostgreSQL backup"',
    ...over,
  };
}

function summary(over: Partial<ErrorSummary> = {}): ErrorSummary {
  return {
    generatedAt: '2026-09-05T12:00:00.000Z',
    // Old enough that resolution is trusted unless a test says otherwise.
    indexedSince: '2026-09-05T00:00:00.000Z',
    windowMinutes: 60,
    totalEvents: 5,
    groups: [group()],
    truncated: false,
    ...over,
  };
}

describe('ErrorLogWatcher', () => {
  const NOW = new Date('2026-09-05T12:00:00.000Z');

  let logs: any;
  let alerts: any;
  let notifier: any;
  let notifications: any;
  let logging: any;
  let heartbeat: any;
  let watcher: ErrorLogWatcher;

  beforeEach(() => {
    logs = {
      hasCredential: jest.fn().mockReturnValue(true),
      fetchErrorSummary: jest.fn().mockResolvedValue(summary()),
      fetchCoverage: jest.fn().mockResolvedValue({
        healthy: true,
        stale_after_hours: 24,
        shipping: [{ service: 'a', last_seen: '2026-09-05T11:00:00Z', age_hours: 1 }],
        stale: [],
        idle: [],
        ignored: [],
        missing: [],
      }),
    };
    alerts = {
      fire: jest.fn().mockResolvedValue({ transition: 'fired', alert: { id: 'a1' }, notify: true }),
      resolveByFingerprint: jest.fn().mockResolvedValue({ resolved: true }),
      findActive: jest.fn().mockResolvedValue([]),
    };
    notifier = { formatFired: jest.fn().mockReturnValue('fired'), formatRepeat: jest.fn().mockReturnValue('repeat') };
    notifications = { sendTelegram: jest.fn().mockResolvedValue(undefined) };
    logging = { log: jest.fn().mockResolvedValue(undefined) };
    heartbeat = { register: jest.fn(), beat: jest.fn(), fail: jest.fn() };
    watcher = new ErrorLogWatcher(logs, alerts, notifier, notifications, logging, heartbeat);
  });

  it('registers with the heartbeat at construction, not on first success', () => {
    // A watcher that throws on every sweep must still age into a WatcherSilent
    // alert rather than never being known to exist.
    expect(heartbeat.register).toHaveBeenCalledWith(ERROR_LOG_WATCHER_NAME, expect.any(Number));
  });

  it('fires on a service that is repeatedly logging errors', async () => {
    await watcher.runCheck(NOW);
    expect(alerts.fire).toHaveBeenCalledTimes(1);
    const dto = alerts.fire.mock.calls[0][0];
    expect(dto.alertname).toBe('ServiceLoggingErrors');
    expect(dto.service).toBe('backups-microservice');
    expect(dto.severity).toBe('warning');
    expect(notifications.sendTelegram).toHaveBeenCalled();
  });

  it('ignores a one-off error', async () => {
    // Roughly five transient failures per persistent one; alerting on each
    // would mute the channel, which is how the original incident stayed
    // invisible.
    logs.fetchErrorSummary.mockResolvedValue(summary({ groups: [group({ count: 1 })] }));
    await watcher.runCheck(NOW);
    expect(alerts.fire).not.toHaveBeenCalled();
  });

  it('escalates a fatal immediately', async () => {
    logs.fetchErrorSummary.mockResolvedValue(summary({ groups: [group({ level: 'fatal', count: 3 })] }));
    await watcher.runCheck(NOW);
    expect(alerts.fire.mock.calls[0][0].severity).toBe('critical');
  });

  it('escalates a high-volume error', async () => {
    logs.fetchErrorSummary.mockResolvedValue(summary({ groups: [group({ count: 500 })] }));
    await watcher.runCheck(NOW);
    expect(alerts.fire.mock.calls[0][0].severity).toBe('critical');
  });

  it('resolves once a signature stops appearing', async () => {
    await watcher.runCheck(NOW);
    logs.fetchErrorSummary.mockResolvedValue(summary({ groups: [] }));
    await watcher.runCheck(NOW);
    expect(alerts.resolveByFingerprint).toHaveBeenCalled();
  });

  it('does NOT resolve when the index is younger than the window', async () => {
    // The failure this guards against: logging-microservice restarts, its
    // in-memory index is empty, and the watcher announces recovery for
    // everything currently broken. Worse, a restart caused by a service
    // failing hard would clear the alerts describing it.
    await watcher.runCheck(NOW);
    alerts.resolveByFingerprint.mockClear();
    logs.fetchErrorSummary.mockResolvedValue(
      summary({ groups: [], indexedSince: '2026-09-05T11:58:00.000Z' }),
    );
    await watcher.runCheck(NOW);
    // Scoped to error fingerprints on purpose. Ingest coverage is derived from
    // file modification times rather than the in-memory index, so its own
    // resolution is unaffected by how long the index has been warm.
    const errorResolves = alerts.resolveByFingerprint.mock.calls.filter(
      (c: any[]) => String(c[0]).startsWith('errorlog:'),
    );
    expect(errorResolves).toHaveLength(0);
  });

  it('does not resolve or beat when the summary cannot be fetched', async () => {
    // "I could not ask" must never be recorded as "nothing is failing".
    await watcher.runCheck(NOW);
    alerts.resolveByFingerprint.mockClear();
    heartbeat.beat.mockClear();
    logs.fetchErrorSummary.mockResolvedValue(null);
    await watcher.runCheck(NOW);
    expect(
      alerts.resolveByFingerprint.mock.calls.filter((c: any[]) =>
        String(c[0]).startsWith('errorlog:'),
      ),
    ).toHaveLength(0);
    expect(heartbeat.beat).not.toHaveBeenCalled();
    expect(heartbeat.fail).toHaveBeenCalled();
  });

  it('does not beat when it has no credential', async () => {
    logs.hasCredential.mockReturnValue(false);
    await watcher.runCheck(NOW);
    expect(alerts.fire).not.toHaveBeenCalled();
    expect(heartbeat.beat).not.toHaveBeenCalled();
  });

  it('beats only after a clean sweep', async () => {
    await watcher.runCheck(NOW);
    expect(heartbeat.beat).toHaveBeenCalledWith(ERROR_LOG_WATCHER_NAME);
  });

  it('does not beat when the sweep throws', async () => {
    logs.fetchErrorSummary.mockRejectedValue(new Error('boom'));
    await watcher.runCheck(NOW);
    expect(heartbeat.beat).not.toHaveBeenCalled();
    expect(heartbeat.fail).toHaveBeenCalled();
  });

  it('keeps sweeping when one group fails to process', async () => {
    // A single malformed entry must not hide every other failing service.
    alerts.fire
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue({ transition: 'fired', alert: { id: 'a2' }, notify: false });
    logs.fetchErrorSummary.mockResolvedValue(
      summary({ groups: [group({ service: 'a' }), group({ service: 'b' })] }),
    );
    await watcher.runCheck(NOW);
    expect(alerts.fire).toHaveBeenCalledTimes(2);
    expect(heartbeat.beat).toHaveBeenCalled();
  });

  it('gives one service+signature one stable fingerprint', async () => {
    await watcher.runCheck(NOW);
    const first = alerts.fire.mock.calls[0][0].fingerprint;
    alerts.fire.mockClear();
    await watcher.runCheck(NOW);
    expect(alerts.fire.mock.calls[0][0].fingerprint).toBe(first);
  });

  it('separates different signatures from the same service', async () => {
    logs.fetchErrorSummary.mockResolvedValue(
      summary({ groups: [group({ signature: 'x' }), group({ signature: 'y' })] }),
    );
    await watcher.runCheck(NOW);
    const [a, b] = alerts.fire.mock.calls.map((c: any[]) => c[0].fingerprint);
    expect(a).not.toBe(b);
  });

  it('respects the notify decision instead of sending every sweep', async () => {
    // Sending on every sweep is what produced 288 messages for one outage.
    alerts.fire.mockResolvedValue({ transition: 'repeat', alert: { id: 'a1' }, notify: false });
    await watcher.runCheck(NOW);
    expect(notifications.sendTelegram).not.toHaveBeenCalled();
  });

  it('says so when the count is a floor rather than exact', async () => {
    logs.fetchErrorSummary.mockResolvedValue(summary({ truncated: true }));
    await watcher.runCheck(NOW);
    expect(alerts.fire.mock.calls[0][0].message).toContain('at least');
  });

  describe('log ingest coverage', () => {
    const staleCoverage = {
      healthy: false,
      stale_after_hours: 24,
      shipping: [],
      stale: [
        { service: 'api-gateway', last_seen: '2026-08-13T06:58:56Z', age_hours: 560.5 },
        { service: 'docs-rag-microservice', last_seen: '2026-07-06T19:22:52Z', age_hours: 1460.1 },
      ],
      idle: [],
      ignored: [],
      missing: [],
    };

    it('alerts when services have stopped shipping logs entirely', async () => {
      // Without this the watcher asserts those services are fine forever,
      // because silence is indistinguishable from health.
      logs.fetchCoverage.mockResolvedValue(staleCoverage);
      await watcher.runCheck(NOW);
      const call = alerts.fire.mock.calls.find((c: any[]) => c[0].alertname === 'LogIngestStale');
      expect(call).toBeDefined();
      expect(call[0].message).toContain('api-gateway');
      expect(call[0].message).toContain('docs-rag-microservice');
    });

    it('raises one aggregate alert, not one per stale service', async () => {
      // Eight simultaneous messages for a weeks-old condition is how a channel
      // gets muted.
      logs.fetchCoverage.mockResolvedValue(staleCoverage);
      await watcher.runCheck(NOW);
      const staleCalls = alerts.fire.mock.calls.filter(
        (c: any[]) => c[0].alertname === 'LogIngestStale',
      );
      expect(staleCalls).toHaveLength(1);
    });

    it('closes the alert once every service is shipping again', async () => {
      await watcher.runCheck(NOW);
      expect(alerts.resolveByFingerprint).toHaveBeenCalledWith('logingest:stale');
    });

    it('stays silent when coverage cannot be read', async () => {
      // Must not announce that ingest is fine on the strength of a failed call.
      logs.fetchCoverage.mockResolvedValue(null);
      await watcher.runCheck(NOW);
      const staleCalls = alerts.fire.mock.calls.filter(
        (c: any[]) => c[0].alertname === 'LogIngestStale',
      );
      expect(staleCalls).toHaveLength(0);
      expect(alerts.resolveByFingerprint).not.toHaveBeenCalledWith('logingest:stale');
    });

    it('lists the worst offender first', async () => {
      logs.fetchCoverage.mockResolvedValue(staleCoverage);
      await watcher.runCheck(NOW);
      const call = alerts.fire.mock.calls.find((c: any[]) => c[0].alertname === 'LogIngestStale');
      const msg = call[0].message as string;
      expect(msg.indexOf('docs-rag-microservice')).toBeLessThan(msg.indexOf('api-gateway'));
    });
  });
});
