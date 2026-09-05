import { HeartbeatService } from './heartbeat.service';

function build() {
  const alerts = {
    fire: jest.fn().mockResolvedValue({ transition: 'fired', alert: { id: 'a1' }, notify: true }),
    resolveByFingerprint: jest.fn().mockResolvedValue({ transition: 'noop', alert: null }),
    findActive: jest.fn().mockResolvedValue([]),
  };
  const notifier = { formatFired: jest.fn().mockReturnValue('msg'), formatRepeat: jest.fn().mockReturnValue('repeat') };
  const notifications = { sendTelegram: jest.fn().mockResolvedValue(undefined) };
  const logging = { log: jest.fn().mockResolvedValue(undefined) };
  const svc = new HeartbeatService(alerts as any, notifier as any, notifications as any, logging as any);
  return { svc, alerts, notifications, logging };
}

const T0 = new Date('2026-09-05T12:00:00Z');
const minutesLater = (m: number) => new Date(T0.getTime() + m * 60000);

describe('HeartbeatService', () => {
  it('gives a freshly registered watcher its grace period', () => {
    const { svc } = build();
    svc.register('job-watcher', 15, T0);
    expect(svc.snapshot(minutesLater(10))[0].silent).toBe(false);
  });

  it('reports a watcher silent after three missed cycles', () => {
    const { svc } = build();
    svc.register('job-watcher', 15, T0);
    expect(svc.snapshot(minutesLater(46))[0].silent).toBe(true);
  });

  it('a beat clears the age', () => {
    const { svc } = build();
    svc.register('job-watcher', 15, T0);
    svc.beat('job-watcher', minutesLater(45));
    expect(svc.snapshot(minutesLater(46))[0].ageMinutes).toBeCloseTo(1);
    expect(svc.snapshot(minutesLater(46))[0].silent).toBe(false);
  });

  it('a failed cycle does NOT count as a beat', () => {
    // A watcher that throws promptly on every cycle is running but not
    // working. If fail() refreshed the clock it would look healthy forever.
    const { svc } = build();
    svc.register('job-watcher', 15, T0);
    svc.fail('job-watcher', 'kube api 403');

    const entry = svc.snapshot(minutesLater(46))[0];
    expect(entry.silent).toBe(true);
    expect(entry.lastError).toBe('kube api 403');
  });

  it('alerts critically when a watcher goes silent', async () => {
    const { svc, alerts, notifications } = build();
    svc.register('job-watcher', 15, T0);
    await svc.runCheck(minutesLater(46));

    expect(alerts.fire).toHaveBeenCalledTimes(1);
    const dto = alerts.fire.mock.calls[0][0];
    expect(dto.alertname).toBe('WatcherSilent');
    // Never downgraded: a blind watcher means everything behind it is unwatched.
    expect(dto.severity).toBe('critical');
    expect(dto.fingerprint).toBe('heartbeat:job-watcher');
    expect(notifications.sendTelegram).toHaveBeenCalled();
  });

  it('names the underlying error when there is one', async () => {
    const { svc, alerts } = build();
    svc.register('job-watcher', 15, T0);
    svc.fail('job-watcher', 'kube api 403 forbidden');
    await svc.runCheck(minutesLater(46));

    expect(alerts.fire.mock.calls[0][0].message).toContain('kube api 403 forbidden');
  });

  it('says so explicitly when the cycle is not running at all', async () => {
    const { svc, alerts } = build();
    svc.register('job-watcher', 15, T0);
    await svc.runCheck(minutesLater(46));
    expect(alerts.fire.mock.calls[0][0].message).toContain('not running at all');
  });

  it('resolves once the watcher beats again', async () => {
    const { svc, alerts } = build();
    svc.register('job-watcher', 15, T0);
    await svc.runCheck(minutesLater(5));
    expect(alerts.fire).not.toHaveBeenCalled();
    expect(alerts.resolveByFingerprint).toHaveBeenCalledWith('heartbeat:job-watcher');
  });

  it('keeps checking other watchers when one check throws', async () => {
    const { svc, alerts } = build();
    svc.register('job-watcher', 15, T0);
    svc.register('host-watcher', 15, T0);
    alerts.fire.mockRejectedValueOnce(new Error('db down'));

    await svc.runCheck(minutesLater(46));
    expect(alerts.fire).toHaveBeenCalledTimes(2);
  });

  it('ignores duplicate registration rather than resetting the clock', () => {
    const { svc } = build();
    svc.register('job-watcher', 15, T0);
    svc.register('job-watcher', 99, T0);
    const snap = svc.snapshot(T0);
    expect(snap).toHaveLength(1);
    expect(snap[0].expectedIntervalMinutes).toBe(15);
  });

  it('ignores beats from watchers that never registered', () => {
    const { svc } = build();
    expect(() => svc.beat('ghost')).not.toThrow();
    expect(svc.snapshot(T0)).toHaveLength(0);
  });
});
