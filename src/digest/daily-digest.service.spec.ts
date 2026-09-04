import { DailyDigestService } from './daily-digest.service';

/**
 * These tests exist because of the 2026-08-26 -> 2026-09-03 outage: the digest
 * stopped reaching Telegram for nine days and nothing anywhere said so. The
 * snapshot is written before the send, so a fresh snapshot row proved only that
 * the job started, and `runDigest()`'s catch logged through a LoggingService that
 * itself swallows transport errors. A delivery failure must be loud.
 */
describe('DailyDigestService delivery failure reporting', () => {
  const entries = [{ name: 'a-service', healthy: true, responseTimeMs: 5, error: null }];

  function build(overrides: {
    sendTelegram?: jest.Mock;
    reportDeliveryFailure?: jest.Mock;
    log?: jest.Mock;
  } = {}) {
    const snapshotRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue(undefined),
    };
    const servicesService = {
      getServicesStatus: jest.fn().mockResolvedValue(
        entries.map((e) => ({ ...e, monitorable: true })),
      ),
    };
    const notifications = {
      sendTelegram: overrides.sendTelegram ?? jest.fn().mockResolvedValue(undefined),
      reportDeliveryFailure: overrides.reportDeliveryFailure ?? jest.fn().mockResolvedValue(undefined),
    };
    const logging = { log: overrides.log ?? jest.fn().mockResolvedValue(undefined) };
    const config = { get: jest.fn().mockReturnValue(undefined) };

    const service = new DailyDigestService(
      snapshotRepo as any,
      servicesService as any,
      notifications as any,
      logging as any,
      config as any,
    );
    return { service, snapshotRepo, servicesService, notifications, logging };
  }

  it('escalates through a second channel when the Telegram send fails', async () => {
    const sendTelegram = jest.fn().mockRejectedValue(new Error('timeout of 8000ms exceeded'));
    const reportDeliveryFailure = jest.fn().mockResolvedValue(undefined);
    const { service } = build({ sendTelegram, reportDeliveryFailure });

    await service.runDigest();

    // The nine-day outage happened because this call did not exist: the failure
    // was caught, logged into a sink that drops errors, and never seen again.
    expect(reportDeliveryFailure).toHaveBeenCalledTimes(1);
    const [reason] = reportDeliveryFailure.mock.calls[0];
    expect(String(reason)).toContain('timeout of 8000ms exceeded');
  });

  it('records the failure as an error-level event, not a success', async () => {
    const sendTelegram = jest.fn().mockRejectedValue(new Error('boom'));
    const log = jest.fn().mockResolvedValue(undefined);
    const { service } = build({ sendTelegram, log });

    await service.runDigest();

    const levels = log.mock.calls.map((c: any[]) => c[0]);
    expect(levels).toContain('error');
    expect(levels).not.toContain('info');
  });

  it('does not escalate when delivery succeeds', async () => {
    const reportDeliveryFailure = jest.fn();
    const { service, logging } = build({ reportDeliveryFailure });

    await service.runDigest();

    expect(reportDeliveryFailure).not.toHaveBeenCalled();
    expect((logging.log as jest.Mock).mock.calls.map((c: any[]) => c[0])).toContain('info');
  });

  it('still surfaces the failure when the escalation channel is also down', async () => {
    const sendTelegram = jest.fn().mockRejectedValue(new Error('primary down'));
    const reportDeliveryFailure = jest.fn().mockRejectedValue(new Error('secondary down'));
    const { service, logging } = build({ sendTelegram, reportDeliveryFailure });

    // A failure to report a failure must not throw out of the cron handler,
    // but it must not silently succeed either.
    await expect(service.runDigest()).resolves.toBeUndefined();

    const errorEvents = (logging.log as jest.Mock).mock.calls.filter(
      (c: any[]) => c[0] === 'error',
    );
    expect(errorEvents.length).toBeGreaterThan(0);
  });
});
