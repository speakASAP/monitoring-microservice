import { HealthWatcher } from './health-watcher';

/**
 * The health watcher turns periodic health checks into alert lifecycle events,
 * so a service going down fires once and a service coming back sends the clear
 * event — without anyone waiting for the 08:00 daily digest to find out.
 *
 * The distinction that matters here is failureKind. A 'config' failure means the
 * registry's healthPath is wrong and the service is fine; alerting on those is
 * what filled monitoring.alerts with noise nobody read. Only real outages fire.
 */
describe('HealthWatcher', () => {
  const status = (over: any = {}) => ({
    name: 'payments-microservice',
    monitorable: true,
    healthy: false,
    failureKind: 'unreachable' as const,
    error: 'connect ECONNREFUSED',
    ...over,
  });

  const build = () => {
    const alerts = {
      fire: jest.fn(async (_dto: any): Promise<any> => ({ transition: 'fired', alert: { id: 'a', service: 'x', occurrenceCount: 1 }, notify: true })),
      resolveByFingerprint: jest.fn(async (_fp: string, _opts?: any): Promise<any> => ({ transition: 'noop', alert: null })),
      findActive: jest.fn(async (): Promise<any[]> => []),
      findStale: jest.fn(async (): Promise<any[]> => []),
    };
    const notifications = { sendTelegram: jest.fn(async () => undefined) };
    const services = { getServicesStatus: jest.fn(async (): Promise<any[]> => []) };
    const logging = { log: jest.fn(async () => undefined) };
    const watcher = new HealthWatcher(
      services as any,
      alerts as any,
      { formatFired: () => 'fired-msg', formatRepeat: () => 'repeat-msg', formatResolved: () => 'resolved-msg' } as any,
      notifications as any,
      logging as any,
    );
    return { watcher, alerts, notifications, services };
  };

  it('fires an alert for a service that is genuinely unreachable', async () => {
    const { watcher, alerts, notifications, services } = build();
    services.getServicesStatus.mockResolvedValue([status()] as any);

    await watcher.runCheck();

    expect(alerts.fire).toHaveBeenCalledTimes(1);
    expect(alerts.fire.mock.calls[0][0]).toMatchObject({
      service: 'payments-microservice',
      fingerprint: 'health:payments-microservice',
    });
    expect(notifications.sendTelegram).toHaveBeenCalledWith('fired-msg');
  });

  it('does NOT fire for a config failure — that is a registry bug, not an outage', async () => {
    const { watcher, alerts, notifications, services } = build();
    services.getServicesStatus.mockResolvedValue([
      status({ failureKind: 'config', error: '404 on /health' }),
    ] as any);

    await watcher.runCheck();

    expect(alerts.fire).not.toHaveBeenCalled();
    expect(notifications.sendTelegram).not.toHaveBeenCalled();
  });

  it('records the recovery but does NOT announce it — AlertSweeper does, after the flap window', async () => {
    // The clear event is deferred, not dropped. Between 2026-08-26 and 09-01,
    // 22 of 26 recoveries were contradicted by a re-fire within ten minutes, so
    // announcing here sent a ✅ and a fresh 🚨 for a service whose real state
    // never changed. AlertSweeper delivers it once the window passes quietly.
    const { watcher, alerts, notifications, services } = build();
    services.getServicesStatus.mockResolvedValue([status({ healthy: true, failureKind: undefined })] as any);
    alerts.resolveByFingerprint.mockResolvedValue({
      transition: 'resolved',
      alert: { id: 'a', service: 'payments-microservice', firedAt: new Date(), resolvedAt: new Date() },
    } as any);

    await watcher.runCheck();

    expect(alerts.resolveByFingerprint).toHaveBeenCalledWith('health:payments-microservice');
    expect(notifications.sendTelegram).not.toHaveBeenCalled();
  });

  it('suppresses a repeat that is still inside its backoff window', async () => {
    // HealthWatcher runs every 5 minutes for as long as a service is down.
    // Notifying on every tick sent 288 messages for a single day-long outage.
    const { watcher, alerts, notifications, services } = build();
    services.getServicesStatus.mockResolvedValue([status()] as any);
    alerts.fire.mockResolvedValue({
      transition: 'repeat',
      alert: { id: 'a', service: 'payments-microservice', occurrenceCount: 7 },
      notify: false,
    } as any);

    await watcher.runCheck();

    expect(alerts.fire).toHaveBeenCalledTimes(1);
    expect(notifications.sendTelegram).not.toHaveBeenCalled();
  });

  it('sends the repeat once the backoff window has elapsed', async () => {
    const { watcher, alerts, notifications, services } = build();
    services.getServicesStatus.mockResolvedValue([status()] as any);
    alerts.fire.mockResolvedValue({
      transition: 'repeat',
      alert: { id: 'a', service: 'payments-microservice', occurrenceCount: 7 },
      notify: true,
    } as any);

    await watcher.runCheck();

    expect(notifications.sendTelegram).toHaveBeenCalledWith('repeat-msg');
  });

  it('stays silent for a healthy service that was never failing', async () => {
    const { watcher, notifications, services } = build();
    services.getServicesStatus.mockResolvedValue([status({ healthy: true, failureKind: undefined })] as any);
    // resolveByFingerprint defaults to 'noop' — nothing was open.

    await watcher.runCheck();

    expect(notifications.sendTelegram).not.toHaveBeenCalled();
  });

  it('ignores services that are not monitorable', async () => {
    const { watcher, alerts, services } = build();
    services.getServicesStatus.mockResolvedValue([status({ monitorable: false })] as any);

    await watcher.runCheck();

    expect(alerts.fire).not.toHaveBeenCalled();
  });

  it('expires alerts that have gone stale — nothing re-fired them', async () => {
    // 2026-08-26: an I/O storm opened 238 alerts. Their resolves arrived while
    // monitoring was down, so they could never be closed and sat 'active'
    // forever, poisoning the digest on every later message. Every source
    // re-fires anything still true, so an alert nobody has re-fired in far
    // longer than its source's interval is over.
    const { watcher, alerts, services } = build();
    services.getServicesStatus.mockResolvedValue([] as any);
    const stale = { id: 's1', service: 'gone', alertname: 'PodNotReady', fingerprint: 'fp-stale' };
    alerts.findStale = jest.fn(async (): Promise<any[]> => [stale]);
    alerts.resolveByFingerprint.mockResolvedValue({ transition: 'resolved', alert: stale } as any);

    await watcher.runCheck();

    expect(alerts.findStale).toHaveBeenCalled();
    // silent: true is what keeps a 236-row expiry sweep out of the sweeper's
    // deferred-recovery queue, which would otherwise announce every one of them.
    expect(alerts.resolveByFingerprint).toHaveBeenCalledWith('fp-stale', { silent: true });
  });

  it('expiring a stale alert is silent — it is bookkeeping, not a recovery', async () => {
    // Announcing "✅ RESOLVED" for 236 alerts at once would be a notification
    // storm about pods that vanished hours ago.
    const { watcher, alerts, notifications, services } = build();
    services.getServicesStatus.mockResolvedValue([] as any);
    const stale = { id: 's1', service: 'gone', alertname: 'PodNotReady', fingerprint: 'fp-stale' };
    alerts.findStale = jest.fn(async (): Promise<any[]> => [stale]);
    alerts.resolveByFingerprint.mockResolvedValue({ transition: 'resolved', alert: stale } as any);

    await watcher.runCheck();

    expect(notifications.sendTelegram).not.toHaveBeenCalled();
  });

  it('one failing service does not stop the rest from being processed', async () => {
    const { watcher, alerts, services } = build();
    services.getServicesStatus.mockResolvedValue([
      status({ name: 'svc-a' }),
      status({ name: 'svc-b' }),
    ] as any);
    alerts.fire.mockRejectedValueOnce(new Error('db down'));

    await watcher.runCheck();

    // svc-a threw; svc-b must still have been attempted.
    expect(alerts.fire).toHaveBeenCalledTimes(2);
  });
});
