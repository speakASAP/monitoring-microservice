import { readFileSync } from 'fs';
import { join } from 'path';
import { JobWatcher } from './job-watcher';
import { buildFingerprint } from './fingerprint';

/**
 * The actual stdout of a failing `catalog-contract-monitor` pod, captured from
 * the cluster on 2026-09-06 (job catalog-contract-monitor-29811224). This is
 * the artifact GAP-3 is about, not a reconstruction of it: the `401` on
 * `product-search` sits around character 760 of ~3900, and everything after it
 * is `skippedContracts` boilerplate longer than the entire message budget.
 *
 * Stored as `.txt` rather than `.log` deliberately: the repository `.gitignore`
 * excludes `*.log`, which would have left this fixture untracked and this
 * regression test unrunnable for everyone else.
 */
const REAL_POD_OUTPUT = readFileSync(
  join(__dirname, '__fixtures__', 'catalog-contract-monitor-pod.txt'),
  'utf8',
);

/**
 * The scenarios below are the measured behaviour of the cluster on 2026-09-05,
 * not invented cases. The central one is `catalog-contract-monitor`: schedule
 * `14,44 * * * *`, lastSuccessfulTime 2026-09-01T07:14:15Z, still failing four
 * days later with zero alerts ever recorded. If this watcher would not have
 * caught that, it does not solve the problem it was built for.
 */
const NOW = new Date('2026-09-05T12:00:00Z');

function makeCronJob(over: Partial<any> = {}): any {
  return {
    name: 'catalog-contract-monitor',
    namespace: 'statex-apps',
    schedule: '14,44 * * * *',
    suspended: false,
    lastScheduleTime: '2026-09-05T11:44:00Z',
    lastSuccessfulTime: '2026-09-01T07:14:15Z',
    creationTimestamp: '2026-08-20T10:00:00Z',
    uid: 'uid-catalog',
    ...over,
  };
}

function build(over: { cronJobs?: any[]; jobs?: any[]; logTail?: string | null } = {}) {
  const kube = {
    isAvailable: jest.fn().mockReturnValue(true),
    listCronJobs: jest.fn().mockResolvedValue(over.cronJobs ?? [makeCronJob()]),
    listJobs: jest.fn().mockResolvedValue(over.jobs ?? []),
    listPodNamesForJob: jest.fn().mockResolvedValue(['catalog-contract-monitor-abc-xyz']),
    getPodLogTail: jest
      .fn()
      .mockResolvedValue(over.logTail === undefined ? 'HTTP 401 Unauthorized' : over.logTail),
  };
  const alerts = {
    fire: jest.fn().mockResolvedValue({ transition: 'fired', alert: { id: 'a1' }, notify: true }),
    resolveByFingerprint: jest.fn().mockResolvedValue({ transition: 'noop', alert: null }),
    findActive: jest.fn().mockResolvedValue([]),
  };
  const notifier = { formatFired: jest.fn().mockReturnValue('msg'), formatRepeat: jest.fn().mockReturnValue('repeat') };
  const notifications = { sendTelegram: jest.fn().mockResolvedValue(undefined) };
  const logging = { log: jest.fn().mockResolvedValue(undefined) };
  const heartbeat = { register: jest.fn(), beat: jest.fn(), fail: jest.fn() };

  const watcher = new JobWatcher(
    kube as any, alerts as any, notifier as any, notifications as any, logging as any, heartbeat as any,
  );
  return { watcher, kube, alerts, notifier, notifications, logging, heartbeat };
}

describe('JobWatcher — the incident it was built for', () => {
  it('alerts on catalog-contract-monitor, which produced zero alerts for four days', async () => {
    const { watcher, alerts } = build();
    await watcher.runCheck(NOW);

    expect(alerts.fire).toHaveBeenCalledTimes(1);
    const dto = alerts.fire.mock.calls[0][0];
    expect(dto.alertname).toBe('CronJobNotSucceeding');
    expect(dto.service).toBe('catalog-contract-monitor');
    // Four days dead is past the 24h escalation.
    expect(dto.severity).toBe('critical');
    expect(dto.fingerprint).toBe(
      buildFingerprint('cronjob', 'statex-apps', 'catalog-contract-monitor'),
    );
  });

  it('sends the alert to Telegram', async () => {
    const { watcher, notifications } = build();
    await watcher.runCheck(NOW);
    expect(notifications.sendTelegram).toHaveBeenCalledWith('msg');
  });

  it('captures the pod log at detection time, because the evidence expires', async () => {
    const { watcher, alerts } = build({
      jobs: [
        { name: 'catalog-contract-monitor-1', ownerUid: 'uid-catalog', failed: 1, succeeded: 0, startTime: '2026-09-05T11:44:00Z', completionTime: null, creationTimestamp: '2026-09-05T11:44:00Z', namespace: 'statex-apps', labelSelectorJobName: 'catalog-contract-monitor-1' },
      ],
    });
    await watcher.runCheck(NOW);

    const dto = alerts.fire.mock.calls[0][0];
    expect(dto.message).toContain('HTTP 401 Unauthorized');
    expect(JSON.parse(dto.labels).evidenceLog).toBe('HTTP 401 Unauthorized');
    expect(JSON.parse(dto.labels).evidencePod).toBe('catalog-contract-monitor-abc-xyz');
  });

  it('still alerts when the evidence is already gone', async () => {
    // pod-janitor reclaims failed pods after 120 minutes. An alert with no log
    // is worth far more than no alert, so a missing log must not abort it.
    const { watcher, alerts, notifications } = build({ logTail: null });
    await watcher.runCheck(NOW);

    expect(alerts.fire).toHaveBeenCalledTimes(1);
    expect(alerts.fire.mock.calls[0][0].message).toContain('already been reclaimed');
    expect(notifications.sendTelegram).toHaveBeenCalled();
  });
});

describe('JobWatcher — noise control', () => {
  it('does not alert on a job that failed once but has since succeeded', async () => {
    // Transient failures outnumbered persistent ones 5:1 over the 8 days before
    // this was written. Alerting per failure event would carry that ratio into
    // the channel, and a noisy channel gets muted — which is how the original
    // incident stayed invisible.
    const { watcher, alerts } = build({
      cronJobs: [makeCronJob({ lastSuccessfulTime: '2026-09-05T11:44:00Z' })],
      jobs: [
        { name: 'catalog-contract-monitor-old', ownerUid: 'uid-catalog', failed: 1, succeeded: 0, startTime: '2026-09-05T11:14:00Z', completionTime: null, creationTimestamp: '2026-09-05T11:14:00Z', namespace: 'statex-apps', labelSelectorJobName: 'x' },
      ],
    });
    await watcher.runCheck(NOW);

    expect(alerts.fire).not.toHaveBeenCalled();
    expect(alerts.resolveByFingerprint).toHaveBeenCalled();
  });

  it('tolerates a single missed run', async () => {
    // 45 minutes late on a 30-minute schedule: within 3 intervals, ordinary jitter.
    const { watcher, alerts } = build({
      cronJobs: [makeCronJob({ lastSuccessfulTime: '2026-09-05T11:15:00Z' })],
    });
    await watcher.runCheck(NOW);
    expect(alerts.fire).not.toHaveBeenCalled();
  });

  it('does not send a repeat that the backoff has not authorised', async () => {
    const { watcher, alerts, notifications } = build();
    alerts.fire.mockResolvedValue({ transition: 'repeat', alert: { id: 'a1' }, notify: false });
    await watcher.runCheck(NOW);

    expect(alerts.fire).toHaveBeenCalled();
    expect(notifications.sendTelegram).not.toHaveBeenCalled();
  });

  it('treats a suspended CronJob as intentional and clears any open alert', async () => {
    const { watcher, alerts } = build({ cronJobs: [makeCronJob({ suspended: true })] });
    await watcher.runCheck(NOW);

    expect(alerts.fire).not.toHaveBeenCalled();
    expect(alerts.resolveByFingerprint).toHaveBeenCalledWith(
      buildFingerprint('cronjob', 'statex-apps', 'catalog-contract-monitor'),
    );
  });

  it('resolves once the job starts succeeding again', async () => {
    const { watcher, alerts } = build({
      cronJobs: [makeCronJob({ lastSuccessfulTime: '2026-09-05T11:44:00Z' })],
    });
    await watcher.runCheck(NOW);
    expect(alerts.resolveByFingerprint).toHaveBeenCalledWith(
      buildFingerprint('cronjob', 'statex-apps', 'catalog-contract-monitor'),
    );
  });
});

describe('JobWatcher — coverage edges', () => {
  it('catches a CronJob that has never succeeded at all', async () => {
    // Without falling back to creationTimestamp, "broken since it shipped" is
    // indistinguishable from "no data" and would never alert.
    const { watcher, alerts } = build({
      cronJobs: [makeCronJob({ lastSuccessfulTime: null })],
    });
    await watcher.runCheck(NOW);

    expect(alerts.fire).toHaveBeenCalledTimes(1);
    expect(alerts.fire.mock.calls[0][0].message).toContain('has never succeeded since creation');
  });

  it('gives a newly created CronJob its grace period', async () => {
    const { watcher, alerts } = build({
      cronJobs: [makeCronJob({ lastSuccessfulTime: null, creationTimestamp: '2026-09-05T11:50:00Z' })],
    });
    await watcher.runCheck(NOW);
    expect(alerts.fire).not.toHaveBeenCalled();
  });

  it('uses each CronJob\u2019s own schedule, so a daily job is not judged as a 30-minute one', async () => {
    // 3h without a success is fatal for a 30-min job and completely normal for
    // a daily one. A single global threshold would alert on every daily job
    // every day.
    const { watcher, alerts } = build({
      cronJobs: [
        makeCronJob({
          name: 'speakasap-lesson-record-sync',
          schedule: '20 2 * * *',
          lastSuccessfulTime: '2026-09-05T02:20:00Z',
          uid: 'uid-sync',
        }),
      ],
    });
    await watcher.runCheck(NOW);
    expect(alerts.fire).not.toHaveBeenCalled();
  });

  it('keeps sweeping when one CronJob blows up', async () => {
    // A single unreadable object must not hide every other broken job.
    const { watcher, alerts, kube } = build({
      cronJobs: [makeCronJob({ name: 'exploding', uid: 'uid-boom' }), makeCronJob()],
    });
    kube.listJobs.mockRejectedValueOnce(new Error('boom'));
    await watcher.runCheck(NOW);

    expect(alerts.fire).toHaveBeenCalledTimes(1);
    expect(alerts.fire.mock.calls[0][0].service).toBe('catalog-contract-monitor');
  });
});

/**
 * GAP-3. The watcher captured the evidence correctly and then threw the cause
 * away while rendering it. Verified against the live alert row on 2026-09-06:
 * `message` (1093 chars) contained neither "401" nor "product-search", while
 * `labels.evidenceLog` (3900 chars) contained the 401 at character 760. The
 * mechanism satisfied invariant I2; the rendering defeated it.
 *
 * These tests are about a property, not a direction: given evidence that
 * contains the cause, the message must contain the cause. Both failure shapes
 * are asserted because either window alone passes one and fails the other.
 */
describe('JobWatcher — the alert must carry the cause (GAP-3)', () => {
  const FAILING_JOB = [
    {
      name: 'catalog-contract-monitor-29811224',
      ownerUid: 'uid-catalog',
      failed: 1,
      succeeded: 0,
      startTime: '2026-09-05T11:44:00Z',
      completionTime: null,
      creationTimestamp: '2026-09-05T11:44:00Z',
      namespace: 'statex-apps',
      labelSelectorJobName: 'catalog-contract-monitor-29811224',
    },
  ];

  async function fireWith(logTail: string) {
    const { watcher, alerts } = build({ jobs: FAILING_JOB, logTail });
    await watcher.runCheck(NOW);
    expect(alerts.fire).toHaveBeenCalledTimes(1);
    const dto = alerts.fire.mock.calls[0][0];
    return { dto, labels: JSON.parse(dto.labels) };
  }

  describe('VB-1 — the real artifact, cause buried mid-document', () => {
    it('is a fixture that actually reproduces the gap', () => {
      // Guards the test itself. If the fixture stops containing the 401, or
      // stops being long enough to truncate, VB-1 would pass vacuously.
      expect(REAL_POD_OUTPUT).toContain('401');
      expect(REAL_POD_OUTPUT.length).toBeGreaterThan(900);
      // The precise shape of the gap: a last-900-characters window misses it.
      expect(REAL_POD_OUTPUT.slice(-900)).not.toContain('401');
    });

    it('puts the 401 in the Telegram message', async () => {
      const { dto } = await fireWith(REAL_POD_OUTPUT);
      expect(dto.message).toContain('401');
    });

    it('names the failing contract, not just the status code', async () => {
      // "401" alone is a symptom. Which call got the 401 is the actionable part.
      const { dto } = await fireWith(REAL_POD_OUTPUT);
      expect(dto.message).toContain('product-search');
    });

    it('carries the whole causal record — what failed, the code, and the message', async () => {
      // The three facts a reader needs to act, all of which sat outside the
      // old 900-character tail window.
      const { dto } = await fireWith(REAL_POD_OUTPUT);
      expect(dto.message).toContain('product-search');
      expect(dto.message).toContain('401');
      expect(dto.message).toContain('Product search did not return 2xx');
    });

    it('does not fill the message with skippedContracts boilerplate instead', async () => {
      // The original defect was not that the message was short. It was that the
      // 900 characters it did carry were entirely the wrong 900 characters.
      const { dto } = await fireWith(REAL_POD_OUTPUT);
      const digest = dto.message.slice(
        dto.message.indexOf('Likely cause'),
        dto.message.indexOf('\n\n', dto.message.indexOf('Likely cause')),
      );
      expect(digest).toContain('401');
      expect(digest).not.toContain('CATALOG_SMOKE_ENABLE_BAZOS_AUTHORIZED');
      expect(digest).not.toContain('No product ID available');
    });
  });

  describe('VB-2 — a stack trace, cause at the very end', () => {
    // The opposite class, and the reason head-only is not the fix either. Node
    // prints frames first and the uncaught error last; a head window keeps the
    // frames and drops the reason.
    const STACK_TRACE =
      Array.from(
        { length: 60 },
        (_, i) => `    at Object.<anonymous> (/app/dist/src/module-${i}/handler.js:${i + 10}:23)`,
      ).join('\n') +
      '\n' +
      'Error: connect ECONNREFUSED 10.43.12.9:5432 — postgres unreachable\n';

    it('is a fixture that actually reproduces the opposite gap', () => {
      expect(STACK_TRACE.length).toBeGreaterThan(900);
      // A head-only window would miss it — this is what makes VB-2 non-trivial.
      expect(STACK_TRACE.slice(0, 900)).not.toContain('ECONNREFUSED');
    });

    it('puts the trailing cause in the Telegram message', async () => {
      const { dto } = await fireWith(STACK_TRACE);
      expect(dto.message).toContain('ECONNREFUSED');
      expect(dto.message).toContain('postgres unreachable');
    });

    it('keeps stack frames as context, so the trace is still readable', async () => {
      const { dto } = await fireWith(STACK_TRACE);
      expect(dto.message).toMatch(/at Object\.<anonymous>/);
    });
  });

  describe('VB-2b — one implementation covers both classes', () => {
    it('marks the elision rather than silently dropping the middle', async () => {
      // An unmarked gap in a log is worse than a shorter log: a reader cannot
      // tell that two adjacent lines were not adjacent.
      const { dto } = await fireWith(REAL_POD_OUTPUT);
      expect(dto.message).toContain('…(elided)…');
      expect(dto.message).toContain('full evidence on the alert row');
    });

    it('respects the message budget so Telegram never rejects the alert', async () => {
      const { dto } = await fireWith(REAL_POD_OUTPUT);
      const rendered = dto.message.slice(dto.message.indexOf('Last output'));
      // Budget plus the header line and the two markers; the point is that it
      // is bounded and nowhere near 4096, not the exact constant.
      expect(rendered.length).toBeLessThan(1200);
    });

    it('leaves short evidence completely alone', async () => {
      // Not everything needs abbreviating. A 20-line failure should arrive whole.
      const short = 'HTTP 401 Unauthorized\nProduct search did not return 2xx';
      const { dto } = await fireWith(short);
      expect(dto.message).toContain(short);
      expect(dto.message).not.toContain('…(elided)…');
      expect(dto.message).not.toContain('(truncated');
    });
  });

  describe('VB-4 — the untruncated evidence is on the alert row', () => {
    it('stores the pod output verbatim in labels, byte for byte', async () => {
      // This is the field Agent D's repair loop reads. If it is ever a
      // rendering rather than the raw tail, GAP-3 reappears at the consumer.
      const { labels } = await fireWith(REAL_POD_OUTPUT);
      expect(labels.evidenceLog).toBe(REAL_POD_OUTPUT);
    });

    it('carries no digest, elision or truncation marker in labels', async () => {
      const { labels } = await fireWith(REAL_POD_OUTPUT);
      expect(labels.evidenceLog).not.toContain('…(elided)…');
      expect(labels.evidenceLog).not.toContain('(truncated');
      expect(labels.evidenceLog).not.toContain('Likely cause');
    });

    it('is machine-readable: labels parses and the evidence is a string', async () => {
      const { dto, labels } = await fireWith(REAL_POD_OUTPUT);
      expect(() => JSON.parse(dto.labels)).not.toThrow();
      expect(typeof labels.evidenceLog).toBe('string');
      // The fixture is itself JSON, so a consumer can go straight to the cause.
      const report = JSON.parse(labels.evidenceLog);
      expect(report.monitor).toBe('catalog-contract-monitor');
    });

    it('declares explicitly that the stored evidence is not abbreviated', async () => {
      const { labels } = await fireWith(REAL_POD_OUTPUT);
      expect(labels.evidenceLogTruncated).toBe(false);
      expect(typeof labels.evidenceLogLines).toBe('number');
    });

    it('is longer than the message, which is the whole distinction', async () => {
      const { dto, labels } = await fireWith(REAL_POD_OUTPUT);
      expect(labels.evidenceLog.length).toBeGreaterThan(dto.message.length);
    });

    it('records evidenceLog as null, not as a string, when the pod was reclaimed', async () => {
      // A consumer must be able to distinguish "no evidence" from "empty
      // evidence" without string-matching the human-facing prose.
      const { watcher, alerts } = build({ jobs: FAILING_JOB, logTail: null });
      await watcher.runCheck(NOW);
      expect(JSON.parse(alerts.fire.mock.calls[0][0].labels).evidenceLog).toBeNull();
    });
  });
});

describe('JobWatcher — heartbeat contract', () => {
  it('registers at construction, before it has ever run', async () => {
    const { heartbeat } = build();
    expect(heartbeat.register).toHaveBeenCalledWith('job-watcher', 15);
  });

  it('beats after a clean sweep', async () => {
    const { watcher, heartbeat } = build();
    await watcher.runCheck(NOW);
    expect(heartbeat.beat).toHaveBeenCalledWith('job-watcher');
  });

  it('does not beat when the sweep failed', async () => {
    // A sweep that threw verified nothing. Counting it as a completed cycle
    // would let the watcher fail forever while looking alive — the same silent
    // failure, one level up.
    const { watcher, kube, heartbeat } = build();
    kube.listCronJobs.mockRejectedValue(new Error('kube api 403'));
    await watcher.runCheck(NOW);

    expect(heartbeat.beat).not.toHaveBeenCalled();
    expect(heartbeat.fail).toHaveBeenCalledWith('job-watcher', 'kube api 403');
  });

  it('stays dormant and does not beat when there is no cluster identity', async () => {
    const { watcher, kube, heartbeat, alerts } = build();
    kube.isAvailable.mockReturnValue(false);
    await watcher.runCheck(NOW);

    expect(alerts.fire).not.toHaveBeenCalled();
    expect(heartbeat.beat).not.toHaveBeenCalled();
  });
});
