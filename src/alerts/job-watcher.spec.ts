import { JobWatcher } from './job-watcher';
import { buildFingerprint } from './fingerprint';

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
