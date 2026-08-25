import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AuthConsumerService } from './auth-consumer.service';
import { MonitoringAuthGuard } from './monitoring-auth.guard';
import { MonitoringAdminGuard } from './monitoring-admin.guard';

const ADMIN_ROLES =
  'global:superadmin,internal:monitoring-microservice:admin';
const OPERATOR_ROLES = 'internal:monitoring-microservice:operator';

function makeAuth(roles: string[]): AuthConsumerService {
  const config = {
    get: (key: string) =>
      key === 'monitoring.adminRoles'
        ? ADMIN_ROLES
        : key === 'monitoring.operatorRoles'
          ? OPERATOR_ROLES
          : undefined,
  } as any;
  const auth = new AuthConsumerService(config);
  jest
    .spyOn(auth, 'validateAuthorizationHeader')
    .mockResolvedValue({ sub: 'u', roles } as any);
  return auth;
}

function ctx(): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization: 'Bearer t' } }),
    }),
  } as any;
}

describe('monitoring guards', () => {
  afterEach(() => jest.restoreAllMocks());

  it('admin guard accepts an admin role', async () => {
    const guard = new MonitoringAdminGuard(makeAuth(['global:superadmin']));
    await expect(guard.canActivate(ctx())).resolves.toBe(true);
  });

  it('admin guard refuses an operator role', async () => {
    const guard = new MonitoringAdminGuard(
      makeAuth(['internal:monitoring-microservice:operator']),
    );
    await expect(guard.canActivate(ctx())).rejects.toThrow(ForbiddenException);
  });

  it('auth guard accepts an operator role', async () => {
    const guard = new MonitoringAuthGuard(
      makeAuth(['internal:monitoring-microservice:operator']),
    );
    await expect(guard.canActivate(ctx())).resolves.toBe(true);
  });

  it('auth guard accepts an admin role', async () => {
    const guard = new MonitoringAuthGuard(makeAuth(['global:superadmin']));
    await expect(guard.canActivate(ctx())).resolves.toBe(true);
  });

  it('auth guard refuses a merely-authenticated principal', async () => {
    // The regression this guards against: any valid ecosystem token used to be
    // enough to manage customer integrations.
    const guard = new MonitoringAuthGuard(
      makeAuth(['internal:catalog-microservice:admin']),
    );
    await expect(guard.canActivate(ctx())).rejects.toThrow(ForbiddenException);
  });

  it('fails closed when no roles are configured', () => {
    const config = { get: () => '' } as any;
    const auth = new AuthConsumerService(config);
    expect(auth.isMonitoringAdmin({ sub: 'u', roles: ['anything'] } as any)).toBe(false);
    expect(auth.isMonitoringOperator({ sub: 'u', roles: ['anything'] } as any)).toBe(false);
  });
});
