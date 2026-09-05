import { RepairVerifier, VerificationTarget, VerifierDeps } from './repair-verifier';
import { FailureSurface } from '../config/failure-surfaces';

/**
 * These tests exist to prove one property above all others: the verifier never
 * reports success when it cannot see. Under D3 there is no reviewer, so a
 * false "verified" is a bad change left running in production with an
 * all-clear attached to it.
 */
describe('RepairVerifier', () => {
  const NOW = new Date('2026-09-05T12:00:00Z');
  const FIX_AT = new Date('2026-09-05T11:00:00Z');

  const cronSurface: FailureSurface = {
    surface: 'cliplot-readiness-monitor',
    kind: 'k8s-cronjob',
    owningRepo: 'cliplot',
    failureDestination: 'monitoring-alert',
    autoFixEligible: true,
  };
  const svcSurface: FailureSurface = {
    surface: 'flipflop-product-service',
    kind: 'k8s-deployment',
    owningRepo: 'flipflop-product-service',
    failureDestination: 'logging-error-log',
    autoFixEligible: true,
  };

  let kube: any;
  let logs: any;
  let verifier: RepairVerifier;
  let deps: VerifierDeps;

  const target = (surface: FailureSurface, service: string): VerificationTarget => ({
    surface,
    service,
    fingerprint: 'fp:test',
    startedAt: FIX_AT,
  });

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    kube = {
      listCronJobs: jest.fn().mockResolvedValue([
        {
          name: 'cliplot-readiness-monitor',
          lastSuccessfulTime: '2026-09-05T11:30:00Z',
        },
      ]),
    };
    logs = {
      fetchCoverage: jest.fn().mockResolvedValue({
        healthy: true,
        stale_after_hours: 24,
        shipping: [{ service: 'flipflop-product-service', last_seen: '', age_hours: 0.2 }],
        stale: [],
        idle: [],
        ignored: [],
        missing: [],
      }),
      fetchErrorSummary: jest.fn().mockResolvedValue({
        generatedAt: NOW.toISOString(),
        indexedSince: '2026-09-05T09:00:00Z',
        windowMinutes: 15,
        totalEvents: 0,
        groups: [],
        truncated: false,
      }),
    };
    verifier = new RepairVerifier(kube, logs);
    deps = {
      getRollout: jest.fn().mockResolvedValue({ ready: true, detail: '1/1 ready' }),
      probeHealth: jest.fn().mockResolvedValue(true),
      newFingerprintsSince: jest.fn().mockResolvedValue([]),
    };
  });

  afterEach(() => jest.useRealTimers());

  it('verifies a genuinely repaired CronJob', async () => {
    const r = await verifier.verify(target(cronSurface, 'cliplot'), deps);
    expect(r.verified).toBe(true);
    expect(r.checks).toHaveLength(4);
  });

  describe('V3 fails closed on unobservable targets', () => {
    it('REFUSES to verify a service that ships no logs', async () => {
      // The single most dangerous interaction in the plan. Eight services are
      // in this state today; if silence counted as success every fix to any of
      // them would verify perfectly and forever.
      logs.fetchCoverage.mockResolvedValue({
        healthy: false,
        stale_after_hours: 24,
        shipping: [],
        stale: [{ service: 'flipflop-product-service', last_seen: '', age_hours: 560 }],
        idle: [],
        ignored: [],
        missing: [],
      });
      const r = await verifier.verify(target(svcSurface, 'flipflop-product-service'), deps);
      expect(r.verified).toBe(false);
      const v3 = r.checks.find((c) => c.check === 'V3_signal_cleared');
      expect(v3.passed).toBe(false);
      expect(v3.detail).toContain('silence is not proof');
    });

    it('refuses when the service is absent from coverage entirely', async () => {
      logs.fetchCoverage.mockResolvedValue({
        healthy: true, stale_after_hours: 24,
        shipping: [], stale: [], idle: [], ignored: [], missing: [],
      });
      const r = await verifier.verify(target(svcSurface, 'flipflop-product-service'), deps);
      expect(r.verified).toBe(false);
    });

    it('refuses when coverage itself cannot be read', async () => {
      logs.fetchCoverage.mockResolvedValue(null);
      const r = await verifier.verify(target(svcSurface, 'flipflop-product-service'), deps);
      expect(r.verified).toBe(false);
    });

    it('refuses while the error index is younger than the window', async () => {
      // A logging restart would otherwise read as "all errors stopped".
      logs.fetchErrorSummary.mockResolvedValue({
        generatedAt: NOW.toISOString(),
        indexedSince: '2026-09-05T11:56:00Z',
        windowMinutes: 15,
        totalEvents: 0,
        groups: [],
        truncated: false,
      });
      const r = await verifier.verify(target(svcSurface, 'flipflop-product-service'), deps);
      expect(r.verified).toBe(false);
      expect(r.summary).toContain('error index only');
    });

    it('refuses while the service is still logging errors', async () => {
      logs.fetchErrorSummary.mockResolvedValue({
        generatedAt: NOW.toISOString(),
        indexedSince: '2026-09-05T09:00:00Z',
        windowMinutes: 15,
        totalEvents: 12,
        groups: [
          { service: 'flipflop-product-service', level: 'error', signature: 'still broken', count: 12 },
        ],
        truncated: false,
      });
      const r = await verifier.verify(target(svcSurface, 'flipflop-product-service'), deps);
      expect(r.verified).toBe(false);
    });

    it('verifies a service that is observable and quiet', async () => {
      const r = await verifier.verify(target(svcSurface, 'flipflop-product-service'), deps);
      expect(r.verified).toBe(true);
    });
  });

  describe('V3 for scheduled jobs requires a real run', () => {
    it('refuses when no run has succeeded since the fix', async () => {
      // A green deploy proves nothing about a job on its own schedule -- which
      // is exactly how the trigger incident stayed hidden for four days.
      kube.listCronJobs.mockResolvedValue([
        { name: 'cliplot-readiness-monitor', lastSuccessfulTime: '2026-09-05T10:00:00Z' },
      ]);
      const r = await verifier.verify(target(cronSurface, 'cliplot'), deps);
      expect(r.verified).toBe(false);
      expect(r.summary).toContain('no successful run since the fix');
    });

    it('refuses when the job has never succeeded', async () => {
      kube.listCronJobs.mockResolvedValue([
        { name: 'cliplot-readiness-monitor', lastSuccessfulTime: null },
      ]);
      const r = await verifier.verify(target(cronSurface, 'cliplot'), deps);
      expect(r.verified).toBe(false);
    });

    it('refuses when CronJob state cannot be read', async () => {
      kube.listCronJobs.mockRejectedValue(new Error('403 forbidden'));
      const r = await verifier.verify(target(cronSurface, 'cliplot'), deps);
      expect(r.verified).toBe(false);
      expect(r.summary).toContain('unverifiable');
    });
  });

  describe('the other three checks', () => {
    it('fails when the fix never actually rolled out', async () => {
      deps.getRollout = jest.fn().mockResolvedValue({ ready: false, detail: '0/1 ready' });
      const r = await verifier.verify(target(cronSurface, 'cliplot'), deps);
      expect(r.verified).toBe(false);
    });

    it('fails when rollout state is unreadable rather than assuming success', async () => {
      deps.getRollout = jest.fn().mockResolvedValue(null);
      const r = await verifier.verify(target(cronSurface, 'cliplot'), deps);
      expect(r.verified).toBe(false);
    });

    it('treats an unreachable health probe as unhealthy', async () => {
      deps.probeHealth = jest.fn().mockResolvedValue(null);
      const r = await verifier.verify(target(cronSurface, 'cliplot'), deps);
      expect(r.verified).toBe(false);
      const v2 = r.checks.find((c) => c.check === 'V2_health');
      expect(v2.detail).toContain('unreachable is not healthy');
    });

    it('fails when the fix broke something else', async () => {
      deps.newFingerprintsSince = jest.fn().mockResolvedValue(['health:some-other-service']);
      const r = await verifier.verify(target(cronSurface, 'cliplot'), deps);
      expect(r.verified).toBe(false);
      expect(r.summary).toContain('new alerts appeared');
    });

    it('ignores the alert under repair when looking for collateral damage', async () => {
      deps.newFingerprintsSince = jest.fn().mockResolvedValue(['fp:test']);
      const r = await verifier.verify(target(cronSurface, 'cliplot'), deps);
      expect(r.verified).toBe(true);
    });

    it('fails closed when the alert store cannot be read', async () => {
      deps.newFingerprintsSince = jest.fn().mockResolvedValue(null);
      const r = await verifier.verify(target(cronSurface, 'cliplot'), deps);
      expect(r.verified).toBe(false);
    });
  });

  it('reports every failing check, not just the first', async () => {
    deps.getRollout = jest.fn().mockResolvedValue({ ready: false, detail: '0/1' });
    deps.probeHealth = jest.fn().mockResolvedValue(false);
    const r = await verifier.verify(target(cronSurface, 'cliplot'), deps);
    expect(r.summary).toContain('V1_rollout');
    expect(r.summary).toContain('V2_health');
  });
});
