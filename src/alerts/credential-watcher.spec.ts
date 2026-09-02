import axios from 'axios';
import { CredentialWatcher } from './credential-watcher';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

/**
 * The credential watcher reconciles the principals auth knows about against the
 * verdicts consumers report on their own credentials.
 *
 * The distinction that matters is SILENCE. Consumers self-report so that no
 * service has to hold another's secret, which means a broken credential usually
 * stops reporting rather than reporting a failure. A principal nothing is
 * checking must therefore be a finding, not a blank row — every incident behind
 * this work looked healthy from the outside.
 *
 * Phase 1 fires no alerts; these tests pin the classification that Phase 2 will
 * later be allowed to alert on.
 */
describe('CredentialWatcher', () => {
  const principal = (over: any = {}) => ({
    id: 'u1',
    email: 'svc-monitoring--logging@internal.alfares.cz',
    isActive: true,
    conventionTarget: 'logging',
    onConvention: true,
    grants: [
      { application: 'logging-microservice', roleName: 'readonly', roleScope: 'internal', expiresAt: null },
    ],
    targetMismatch: false,
    ...over,
  });

  const build = () => {
    const logging = { log: jest.fn(async () => undefined) };
    const watcher = new CredentialWatcher(logging as any);
    return { watcher, logging };
  };

  const inventory = (principals: any[]) => {
    mockedAxios.get.mockResolvedValue({ data: { principals } } as any);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AUTH_SERVICE_TOKEN = 'test-token';
  });

  it('reports a principal that has never reported as silent, not as healthy', async () => {
    const { watcher } = build();
    inventory([principal()]);

    const result = await watcher.runCheck();

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('silent');
    expect(result[0].detail).toContain('never reported');
  });

  it('reads the inventory with an RS256 bearer, not the shared static header', async () => {
    const { watcher } = build();
    inventory([principal()]);

    await watcher.runCheck();

    const [, cfg] = mockedAxios.get.mock.calls[0] as any[];
    // The shared static string carries no identity, so a rejection could not be
    // attributed and the credential could not be enumerated -- the watcher would
    // be blind to its own credential. See the plan's Task E.
    expect(cfg.headers.Authorization).toBe('Bearer test-token');
    expect(cfg.headers['x-internal-service-token']).toBeUndefined();
  });

  it('reports an accepted verdict from the consumer', async () => {
    const { watcher } = build();
    inventory([principal()]);

    await watcher.recordSelfReport({
      principal: 'svc-monitoring--logging@internal.alfares.cz',
      target: 'logging-microservice',
      verdict: 'accepted',
    });

    const result = await watcher.runCheck();
    expect(result[0].status).toBe('accepted');
  });

  it('reports a rejected verdict — the credential the consumer holds was refused', async () => {
    const { watcher } = build();
    inventory([principal()]);

    await watcher.recordSelfReport({
      principal: 'svc-monitoring--logging@internal.alfares.cz',
      target: 'logging-microservice',
      verdict: 'rejected',
      status: 401,
    });

    const result = await watcher.runCheck();
    expect(result[0].status).toBe('rejected');
  });

  it('keeps an indeterminate verdict distinct from a rejection', async () => {
    const { watcher } = build();
    inventory([principal()]);

    await watcher.recordSelfReport({
      principal: 'svc-monitoring--logging@internal.alfares.cz',
      target: 'logging-microservice',
      verdict: 'indeterminate',
      status: 503,
      detail: 'receiver unreachable',
    });

    const result = await watcher.runCheck();

    // A receiver being down is a health problem HealthWatcher already owns.
    // Collapsing it into 'rejected' would double-report one incident and train
    // the channel to ignore both.
    expect(result[0].status).toBe('indeterminate');
    expect(result[0].status).not.toBe('rejected');
  });

  it('ages a report out to stale rather than trusting it forever', async () => {
    const { watcher } = build();
    inventory([principal()]);

    await watcher.recordSelfReport({
      principal: 'svc-monitoring--logging@internal.alfares.cz',
      target: 'logging-microservice',
      verdict: 'accepted',
    });

    // Push the stored report past the TTL. A credential that broke this morning
    // must not still read as accepted tonight.
    const stored = watcher.getReports()[0];
    stored.receivedAt = new Date(Date.now() - 1000 * 60 * 60 * 24);

    const result = await watcher.runCheck();
    expect(result[0].status).toBe('stale');
  });

  it('reports every principal, including ones off the address convention', async () => {
    const { watcher } = build();
    inventory([
      principal(),
      // Real production shapes: 21 of 45 service principals do not match
      // `svc-%@internal.alfares.cz`, several on unroutable domains. Selecting by
      // address would drop them silently — the exact gap being closed.
      principal({ id: 'u2', email: 'orders-action-admin@internal.invalid', onConvention: false, conventionTarget: null }),
      principal({ id: 'u3', email: 'suppliers-catalog-service@alfares.cz', onConvention: false, conventionTarget: null }),
    ]);

    const result = await watcher.runCheck();

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.principal)).toContain('orders-action-admin@internal.invalid');
    expect(result.map((r) => r.principal)).toContain('suppliers-catalog-service@alfares.cz');
  });

  it('surfaces a reporter using a principal the inventory does not list', async () => {
    const { watcher, logging } = build();
    inventory([principal()]);

    await watcher.recordSelfReport({
      principal: 'ghost-service@internal.invalid',
      target: 'orders-microservice',
      verdict: 'accepted',
    });

    await watcher.runCheck();

    const sweep = (logging.log.mock.calls as unknown as any[][]).find(
      (c) => c[1] === 'credential_watch_sweep',
    );
    expect(sweep).toBeDefined();
    expect(sweep![2].unknownReporters).toContain('ghost-service@internal.invalid');
  });

  it('reports its own inventory failure loudly instead of returning an empty sweep', async () => {
    const { watcher, logging } = build();
    mockedAxios.get.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const result = await watcher.runCheck();

    // An empty result would read as "nothing to check" — indistinguishable from
    // a clean fleet, and this watcher's own credential expiring is precisely the
    // failure it exists to catch.
    expect(result).toEqual([]);
    expect(logging.log).toHaveBeenCalledWith(
      'error',
      'credential_watch_inventory_failed',
      expect.objectContaining({ error: expect.stringContaining('ECONNREFUSED') }),
    );
  });

  it('refuses to sweep with an empty AUTH_SERVICE_TOKEN', async () => {
    const { watcher, logging } = build();
    process.env.AUTH_SERVICE_TOKEN = '';

    const result = await watcher.runCheck();

    // The empty-credential class directly: catalog-contract-monitor ran for
    // weeks with JWT_TOKEN set to "" and 401'd every time.
    expect(result).toEqual([]);
    expect(logging.log).toHaveBeenCalledWith(
      'error',
      'credential_watch_inventory_failed',
      expect.objectContaining({ error: expect.stringContaining('AUTH_SERVICE_TOKEN is empty') }),
    );
  });
});
