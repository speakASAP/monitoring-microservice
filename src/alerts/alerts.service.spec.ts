import { AlertsService } from './alerts.service';
import { Alert } from './alerts.entity';

/**
 * Transition tests for stateful alerting (fire -> repeat -> resolve).
 *
 * The incident these exist to prevent, measured in production 2026-08-26:
 * monitoring.alerts held 326,745 rows, every one of them status='active' and
 * not a single 'resolved'. Two independent bugs combined:
 *
 *   1. The then-live Alertmanager webhook received resolve events and only
 *      wrote a log line, so nothing was ever closed. (That source was retired
 *      on 2026-08-27; the lifecycle it exposed is still driven by HealthWatcher
 *      and the deploy queue, which is why these tests remain.)
 *   2. AlertsService.create() unconditionally INSERTed, and the source
 *      re-POSTed every 4h, so one long-running problem grew a
 *      new row every 4 hours -- 324,835 of them for a single alertname/service.
 *
 * The result: the alert table could not answer "what is broken right now",
 * which is the entire question it exists to answer.
 */
describe('AlertsService lifecycle', () => {
  let service: AlertsService;
  let rows: Alert[];

  // Minimal in-memory stand-in for the repository. Deliberately enforces the
  // partial unique index from migrate-alert-lifecycle.sql, because a fake that
  // permits duplicate active fingerprints would let bug #2 pass these tests.
  const repo = {
    find: jest.fn(async ({ where }: any) => rows.filter((r) => r.status === where.status)),
    findOne: jest.fn(async ({ where }: any) =>
      rows.find((r) =>
        Object.entries(where).every(([k, v]) => (r as any)[k] === v),
      ) ?? null,
    ),
    create: jest.fn((dto: any) => dto as Alert),
    update: jest.fn(async (id: string, patch: any) => {
      const row = rows.find((r) => r.id === id);
      if (row) Object.assign(row, patch);
      return { affected: row ? 1 : 0 };
    }),
    save: jest.fn(async (a: Alert) => {
      if (
        a.status === 'active' &&
        a.fingerprint &&
        rows.some((r) => r !== a && r.status === 'active' && r.fingerprint === a.fingerprint)
      ) {
        throw new Error('duplicate key value violates unique constraint "uq_alerts_active_fingerprint"');
      }
      if (!rows.includes(a)) rows.push(a);
      return a;
    }),
  };

  const fireDto = (over: Partial<Alert> = {}) => ({
    alertname: 'PodNotReady',
    service: 'catalog-microservice',
    severity: 'warning',
    message: 'Pod statex-apps/cliplot-abc not ready for 5 minutes',
    fingerprint: 'fp-001',
    ...over,
  });

  beforeEach(() => {
    rows = [];
    jest.clearAllMocks();
    service = new AlertsService(repo as any);
  });

  it('first fire creates an active alert and reports the transition as fired', async () => {
    const res = await service.fire(fireDto());

    expect(res.transition).toBe('fired');
    expect(res.alert.status).toBe('active');
    expect(res.alert.occurrenceCount).toBe(1);
    expect(rows).toHaveLength(1);
  });

  it('re-fire updates the existing row instead of inserting a duplicate', async () => {
    await service.fire(fireDto());
    const res = await service.fire(fireDto({ message: 'still not ready' }));

    // This is bug #2: without the upsert this is 2 rows and 324k by August.
    expect(rows).toHaveLength(1);
    expect(res.transition).toBe('repeat');
    expect(res.alert.occurrenceCount).toBe(2);
    expect(res.alert.message).toBe('still not ready');
  });

  it('resolving an active alert closes it and reports the transition as resolved', async () => {
    await service.fire(fireDto());
    const res = await service.resolveByFingerprint('fp-001');

    expect(res.transition).toBe('resolved');
    expect(res.alert!.status).toBe('resolved');
    expect(res.alert!.resolvedAt).toBeInstanceOf(Date);
  });

  it('resolving something that was never firing is a no-op, not an error', async () => {
    // Sources re-send resolves; a resolve for an alert we never recorded
    // must not fabricate a recovery notification for a service that was fine.
    const res = await service.resolveByFingerprint('fp-never-seen');

    expect(res.transition).toBe('noop');
    expect(res.alert).toBeNull();
  });

  it('re-firing LONG after a resolve opens a NEW alert rather than reviving the old row', async () => {
    // Outside the flap window the earlier outage is genuinely over: its ✅ was
    // already announced, so a fresh failure is fresh news and needs its own row.
    await service.fire(fireDto());
    await service.resolveByFingerprint('fp-001');

    // Age the recovery past the flap window and past its announcement.
    const resolved = rows.find((r) => r.status === 'resolved');
    resolved.pendingResolveSince = null;
    resolved.resolvedAt = new Date(Date.now() - 60 * 60_000);

    const res = await service.fire(fireDto());

    expect(res.transition).toBe('fired');
    expect(res.notify).toBe(true);
    expect(res.alert.occurrenceCount).toBe(1);
    expect(rows.filter((r) => r.status === 'resolved')).toHaveLength(1);
    expect(rows.filter((r) => r.status === 'active')).toHaveLength(1);
  });

  it('re-firing INSIDE the flap window reopens the same row and stays silent', async () => {
    // Measured 2026-08-26..09-01: 26 resolved -> fired cycles, 22 of them under
    // ten minutes. Each one sent a ✅ then a fresh 🚨 about a service whose real
    // state never changed. The recovery here was never announced, so the
    // standing 🚨 is still correct and the honest action is to say nothing.
    await service.fire(fireDto());
    await service.resolveByFingerprint('fp-001');

    const res = await service.fire(fireDto());

    expect(res.transition).toBe('reopened');
    expect(res.notify).toBe(false);
    expect(res.alert.flapCount).toBe(1);
    expect(rows.filter((r) => r.status === 'active')).toHaveLength(1);
    expect(rows.filter((r) => r.status === 'resolved')).toHaveLength(0);
    // The debt is cleared: this recovery must never be announced later.
    expect(res.alert.pendingResolveSince).toBeNull();
  });

  it('a silent resolve owes no recovery message', async () => {
    // Stale expiry closes alerts for pods that vanished hours ago. Announcing
    // them would be a storm about ancient history.
    await service.fire(fireDto());
    const res = await service.resolveByFingerprint('fp-001', { silent: true });

    expect(res.transition).toBe('resolved');
    expect(res.alert!.pendingResolveSince).toBeNull();
    expect(await service.findDueResolves()).toHaveLength(0);
  });

  it('a deferred recovery becomes due only after the flap window passes', async () => {
    await service.fire(fireDto());
    await service.resolveByFingerprint('fp-001');

    expect(await service.findDueResolves()).toHaveLength(0);

    const later = new Date(Date.now() + 11 * 60_000);
    const due = await service.findDueResolves(later);
    expect(due).toHaveLength(1);
    expect(due[0].fingerprint).toBe('fp-001');
  });

  it('distinct fingerprints are distinct alerts even under one alertname', async () => {
    // Historical rows put the scraper in `service`, so two broken
    // pods share alertname AND service. Collapsing them would hide an outage.
    await service.fire(fireDto({ fingerprint: 'fp-001' }));
    await service.fire(fireDto({ fingerprint: 'fp-002' }));

    expect(rows.filter((r) => r.status === 'active')).toHaveLength(2);
  });
});
