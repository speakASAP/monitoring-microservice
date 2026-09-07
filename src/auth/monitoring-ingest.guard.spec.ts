import 'reflect-metadata';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { MonitoringIngestGuard } from './monitoring-ingest.guard';

/**
 * Alert ingest can create and CLEAR alerts. These tests pin Auth RS256 + role
 * enforcement — static shared secrets must never authorize.
 */
describe('MonitoringIngestGuard', () => {
  const ctx = (authorization?: string): ExecutionContext =>
    ({ switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }) }) as any;

  const guard = new MonitoringIngestGuard();
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('admits a principal holding internal:monitoring-microservice:ingest', async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        valid: true,
        user: { id: 'svc-1', roles: ['internal:monitoring-microservice:ingest'] },
      }),
    })) as never;

    await expect(guard.canActivate(ctx('Bearer rs256-jwt'))).resolves.toBe(true);
  });

  it('rejects a valid principal without the ingest role', async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        valid: true,
        user: { id: 'svc-1', roles: ['internal:monitoring-microservice:readonly'] },
      }),
    })) as never;

    await expect(guard.canActivate(ctx('Bearer rs256-jwt'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('does not accept global:superadmin as an ingest role', async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        valid: true,
        user: { id: 'human-1', roles: ['global:superadmin'] },
      }),
    })) as never;

    await expect(guard.canActivate(ctx('Bearer rs256-jwt'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('refuses a static bearer that Auth does not validate', async () => {
    process.env.NOTIFICATION_SERVICE_TOKEN = 'correct-horse-battery-staple';
    process.env.ALERT_INGEST_TOKEN = 'alert-static';
    globalThis.fetch = jest.fn(async () => ({ ok: false })) as never;

    await expect(
      guard.canActivate(ctx('Bearer correct-horse-battery-staple')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard.canActivate(ctx('Bearer alert-static'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('fails closed when Auth validate is unreachable', async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as never;

    await expect(guard.canActivate(ctx('Bearer rs256-jwt'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a missing or malformed Authorization header', async () => {
    await expect(guard.canActivate(ctx(undefined))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard.canActivate(ctx('Basic secret'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(guard.canActivate(ctx('Bearer    '))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
