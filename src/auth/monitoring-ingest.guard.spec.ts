import 'reflect-metadata';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { MonitoringIngestGuard } from './monitoring-ingest.guard';

/**
 * The alert ingest endpoints let a caller create and CLEAR alerts. A caller who
 * can clear alerts can silence the monitoring system, so these tests pin the
 * authorization rules — including that a missing secret closes the door rather
 * than opening it.
 */
describe('MonitoringIngestGuard', () => {
  const ctx = (authorization?: string): ExecutionContext =>
    ({ switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }) }) as any;

  const guard = new MonitoringIngestGuard();
  const ORIGINAL = process.env.NOTIFICATION_SERVICE_TOKEN;

  afterEach(() => {
    process.env.NOTIFICATION_SERVICE_TOKEN = ORIGINAL;
    delete process.env.ALERT_INGEST_TOKEN;
  });

  it('admits the deploy queue presenting the borrowed service token', async () => {
    process.env.NOTIFICATION_SERVICE_TOKEN = 'correct-horse-battery-staple';
    await expect(guard.canActivate(ctx('Bearer correct-horse-battery-staple'))).resolves.toBe(true);
  });

  it('rejects a wrong token of the same length', async () => {
    // Same length so the rejection comes from the comparison, not the length check.
    process.env.NOTIFICATION_SERVICE_TOKEN = 'correct-horse-battery-staple';
    await expect(guard.canActivate(ctx('Bearer wrongg-horse-battery-staple'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects a token of a different length', async () => {
    process.env.NOTIFICATION_SERVICE_TOKEN = 'correct-horse-battery-staple';
    await expect(guard.canActivate(ctx('Bearer short'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails CLOSED when no ingest credential is configured', async () => {
    // A missing env var must not turn this into an open write endpoint.
    delete process.env.NOTIFICATION_SERVICE_TOKEN;
    await expect(guard.canActivate(ctx('Bearer anything'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a missing or malformed Authorization header', async () => {
    process.env.NOTIFICATION_SERVICE_TOKEN = 'secret';
    await expect(guard.canActivate(ctx(undefined))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard.canActivate(ctx('Basic secret'))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard.canActivate(ctx('Bearer    '))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
