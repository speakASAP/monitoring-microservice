import { AlertSweeper } from './alert-sweeper';

/**
 * The sweeper pays the recovery debt that resolve deliberately withheld.
 *
 * The failure mode it must avoid is announcing a recovery twice, or stranding
 * one forever: both would make the channel untrustworthy in exactly the way
 * this lane exists to fix.
 */
describe('AlertSweeper', () => {
  const alertRow = (over: any = {}) => ({
    id: 'a1',
    service: 'kube-state-metrics',
    alertname: 'PodNotReady',
    firedAt: new Date('2026-09-04T11:00:00Z'),
    resolvedAt: new Date('2026-09-04T11:45:00Z'),
    pendingResolveSince: new Date('2026-09-04T11:45:00Z'),
    flapCount: 0,
    ...over,
  });

  const build = () => {
    const alerts = {
      findDueResolves: jest.fn(async (): Promise<any[]> => []),
      findActive: jest.fn(async (): Promise<any[]> => []),
      markResolveNotified: jest.fn(async () => undefined),
    };
    const notifications = { sendTelegram: jest.fn(async () => undefined) };
    const logging = { log: jest.fn(async () => undefined) };
    const sweeper = new AlertSweeper(
      alerts as any,
      { formatResolved: () => 'resolved-msg' } as any,
      notifications as any,
      logging as any,
    );
    return { sweeper, alerts, notifications, logging };
  };

  it('sends nothing when no recovery is owed', async () => {
    const { sweeper, notifications } = build();

    expect(await sweeper.flushDueResolves()).toBe(0);
    expect(notifications.sendTelegram).not.toHaveBeenCalled();
  });

  it('delivers a due recovery exactly once and clears the debt', async () => {
    const { sweeper, alerts, notifications } = build();
    alerts.findDueResolves.mockResolvedValue([alertRow()] as any);

    expect(await sweeper.flushDueResolves()).toBe(1);
    expect(notifications.sendTelegram).toHaveBeenCalledWith('resolved-msg');
    // Clearing pendingResolveSince is what makes delivery exactly-once.
    expect(alerts.markResolveNotified).toHaveBeenCalledWith('a1', expect.any(Date));
  });

  it('leaves the debt intact when delivery fails, so it retries next sweep', async () => {
    // Clearing the flag before a confirmed send would silently lose the
    // recovery — the channel would keep implying the service is still down.
    const { sweeper, alerts, notifications } = build();
    alerts.findDueResolves.mockResolvedValue([alertRow()] as any);
    notifications.sendTelegram.mockRejectedValue(new Error('telegram timeout'));

    expect(await sweeper.flushDueResolves()).toBe(0);
    expect(alerts.markResolveNotified).not.toHaveBeenCalled();
  });

  it('one failed delivery does not strand the other owed recoveries', async () => {
    const { sweeper, alerts, notifications } = build();
    alerts.findDueResolves.mockResolvedValue([
      alertRow({ id: 'a1' }),
      alertRow({ id: 'a2' }),
    ] as any);
    notifications.sendTelegram.mockRejectedValueOnce(new Error('telegram timeout'));

    expect(await sweeper.flushDueResolves()).toBe(1);
    expect(alerts.markResolveNotified).toHaveBeenCalledTimes(1);
    expect(alerts.markResolveNotified).toHaveBeenCalledWith('a2', expect.any(Date));
  });

  it('survives the lookup itself failing', async () => {
    const { sweeper, alerts, notifications } = build();
    alerts.findDueResolves.mockRejectedValue(new Error('db down'));

    expect(await sweeper.flushDueResolves()).toBe(0);
    expect(notifications.sendTelegram).not.toHaveBeenCalled();
  });
});
