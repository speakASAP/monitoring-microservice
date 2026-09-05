import { evaluateRepairGate, GateInput, MAX_ATTEMPTS_PER_FINGERPRINT } from './repair-gate';

/**
 * The gate is the only control that can stop a *correct-looking* bad fix, so
 * these tests are about refusal, not permission.
 */
describe('evaluateRepairGate', () => {
  const base: GateInput = {
    alertname: 'CronJobNotSucceeding',
    service: 'cliplot-readiness-monitor',
    fingerprint: 'cronjob:cliplot-readiness-monitor',
    priorAttempts: 0,
  };

  it('allows repair on a ledger surface marked eligible', () => {
    const d = evaluateRepairGate(base);
    expect(d.allowed).toBe(true);
    expect(d.surface?.surface).toBe('cliplot-readiness-monitor');
  });

  it('refuses the surface that started this whole project', () => {
    // catalog-contract-monitor failed because of a deliberate auth hardening.
    // The "fix" that passes every outcome check is reverting that hardening,
    // which is why no outcome gate can be trusted here and the ledger must say
    // no outright.
    const d = evaluateRepairGate({
      ...base,
      service: 'catalog-contract-monitor',
      fingerprint: 'cronjob:catalog-contract-monitor',
    });
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain('auto_fix_eligible=false');
  });

  it('refuses a service that is not in the ledger at all', () => {
    const d = evaluateRepairGate({ ...base, service: 'some-service-nobody-registered' });
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain('no ledger entry');
  });

  it('refuses when the service is missing entirely', () => {
    const d = evaluateRepairGate({ ...base, service: null });
    expect(d.allowed).toBe(false);
  });

  it('refuses an alert with no fingerprint', () => {
    // No fingerprint means no dedup key, so a flapping detector would open one
    // goal per cycle.
    const d = evaluateRepairGate({ ...base, fingerprint: null });
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain('fingerprint');
  });

  it('never repairs the monitoring stack observing itself', () => {
    for (const alertname of ['WatcherHeartbeatMissing', 'LogIngestStale', 'AlertDeliveryFailure']) {
      const d = evaluateRepairGate({ ...base, alertname });
      expect(d.allowed).toBe(false);
      expect(d.reason).toMatch(/monitoring stack itself/);
    }
  });

  it('stops after the attempt budget rather than retrying', () => {
    const d = evaluateRepairGate({ ...base, priorAttempts: MAX_ATTEMPTS_PER_FINGERPRINT });
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain('escalating instead of retrying');
  });

  it('honours a cooldown after a failed repair', () => {
    const now = new Date('2026-09-05T12:00:00Z');
    const d = evaluateRepairGate(
      { ...base, ineligibleUntil: new Date('2026-09-05T15:00:00Z') },
      now,
    );
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain('cooldown');
  });

  it('allows again once the cooldown has expired', () => {
    const now = new Date('2026-09-05T18:00:00Z');
    const d = evaluateRepairGate(
      { ...base, ineligibleUntil: new Date('2026-09-05T15:00:00Z') },
      now,
    );
    expect(d.allowed).toBe(true);
  });

  it('always supplies a reason when it refuses', () => {
    // The reason is written verbatim into the human escalation, so a blank one
    // would produce an alert nobody can act on.
    const refusals = [
      { ...base, service: 'catalog-contract-monitor' },
      { ...base, service: 'unregistered' },
      { ...base, fingerprint: null },
      { ...base, alertname: 'LogIngestStale' },
      { ...base, priorAttempts: 9 },
    ];
    for (const r of refusals) {
      const d = evaluateRepairGate(r);
      expect(d.allowed).toBe(false);
      expect(d.reason && d.reason.length).toBeGreaterThan(10);
    }
  });
});
