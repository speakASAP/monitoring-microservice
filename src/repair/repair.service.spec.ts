import { RepairService } from './repair.service';

/**
 * The orchestrator's job in shadow mode is to decide correctly and act on
 * nothing. These tests check both halves, because a shadow mode that quietly
 * acts is worse than no shadow mode at all.
 */
describe('RepairService', () => {
  const NOW = new Date('2026-09-05T12:00:00Z');
  let repo: any;
  let alerts: any;
  let notifications: any;
  let heartbeat: any;
  let svc: RepairService;
  let saved: any[];

  const alert = (over: any = {}) => ({
    alertname: 'CronJobNotSucceeding',
    service: 'cliplot-readiness-monitor',
    fingerprint: 'cronjob:cliplot-readiness-monitor',
    severity: 'critical',
    ...over,
  });

  beforeEach(() => {
    saved = [];
    repo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((x: any) => x),
      save: jest.fn(async (x: any) => {
        saved.push(x);
        return x;
      }),
    };
    alerts = { findActive: jest.fn().mockResolvedValue([alert()]) };
    notifications = { sendTelegram: jest.fn().mockResolvedValue(undefined) };
    heartbeat = { register: jest.fn(), beat: jest.fn().mockResolvedValue(undefined) };
    svc = new RepairService(repo, alerts, notifications, heartbeat);
  });

  it('registers itself for heartbeat monitoring on construction', () => {
    // A repair loop that dies silently is the original incident one level up.
    expect(heartbeat.register).toHaveBeenCalledWith('repair-orchestrator', expect.any(Number));
  });

  it('records an eligible alert as shadow and takes no action', async () => {
    await svc.sweep(NOW);
    expect(saved).toHaveLength(1);
    expect(saved[0].status).toBe('shadow');
    expect(notifications.sendTelegram).not.toHaveBeenCalled();
  });

  it('blocks an ineligible surface and escalates it to a human', async () => {
    alerts.findActive.mockResolvedValue([
      alert({ service: 'catalog-contract-monitor', fingerprint: 'cronjob:catalog-contract-monitor' }),
    ]);
    await svc.sweep(NOW);
    expect(saved[0].status).toBe('blocked');
    expect(saved[0].blockedReason).toContain('auto_fix_eligible=false');
    expect(notifications.sendTelegram).toHaveBeenCalled();
    expect(notifications.sendTelegram.mock.calls[0][0]).toContain('human needed');
  });

  it('decides once per fingerprint rather than on every sweep', async () => {
    // Otherwise a flapping detector escalates every ten minutes and the
    // channel gets muted -- the failure that hid the original incident.
    repo.find.mockResolvedValue([
      { status: 'blocked', startedAt: NOW, finishedAt: NOW },
    ]);
    await svc.sweep(NOW);
    expect(saved).toHaveLength(0);
    expect(notifications.sendTelegram).not.toHaveBeenCalled();
  });

  it('does not re-decide while an attempt is still running', async () => {
    repo.find.mockResolvedValue([{ status: 'in_progress', startedAt: NOW }]);
    await svc.sweep(NOW);
    expect(saved).toHaveLength(0);
  });

  it('skips alerts with no fingerprint', async () => {
    alerts.findActive.mockResolvedValue([alert({ fingerprint: null })]);
    await svc.sweep(NOW);
    expect(saved).toHaveLength(0);
  });

  it('applies a cooldown after a failed repair on the same surface', async () => {
    repo.findOne.mockResolvedValue({
      finishedAt: new Date('2026-09-05T11:00:00Z'),
    });
    await svc.sweep(NOW);
    expect(saved[0].status).toBe('blocked');
    expect(saved[0].blockedReason).toContain('cooldown');
  });

  it('beats its heartbeat after a completed sweep', async () => {
    await svc.sweep(NOW);
    expect(heartbeat.beat).toHaveBeenCalledWith('repair-orchestrator');
  });

  it('keeps sweeping when one alert cannot be evaluated', async () => {
    alerts.findActive.mockResolvedValue([alert({ service: 'catalog-contract-monitor' }), alert()]);
    repo.save.mockImplementationOnce(async () => {
      throw new Error('db blip');
    });
    await svc.sweep(NOW);
    // The second alert was still processed despite the first one throwing.
    expect(repo.save).toHaveBeenCalledTimes(2);
    expect(heartbeat.beat).toHaveBeenCalled();
  });

  it('still records the block when the escalation cannot be delivered', async () => {
    // The durable record must not depend on Telegram being reachable.
    alerts.findActive.mockResolvedValue([alert({ service: 'catalog-contract-monitor' })]);
    notifications.sendTelegram.mockRejectedValue(new Error('telegram down'));
    await svc.sweep(NOW);
    expect(saved[0].status).toBe('blocked');
  });

  it('does not beat the heartbeat if the alert store is unreadable', async () => {
    // Otherwise a blind orchestrator reports itself healthy.
    alerts.findActive.mockRejectedValue(new Error('db down'));
    await svc.scheduledSweep();
    expect(heartbeat.beat).not.toHaveBeenCalled();
  });
});
