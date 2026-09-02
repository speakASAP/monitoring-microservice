import { CredentialSelfReporter } from './credential-self-reporter';

/**
 * The pilot adoption of the self-report contract.
 *
 * The behaviour worth pinning is that this reporter cannot go quiet without
 * saying so. Silence is the primary signal in this design, so a reporter that
 * skips a cycle without a trace is indistinguishable from a credential that
 * broke — which is the failure the whole plan exists to prevent.
 */
describe('CredentialSelfReporter', () => {
  const build = () => {
    const logging = { log: jest.fn(async () => undefined) };
    const reporter = new CredentialSelfReporter(logging as any);
    return { reporter, logging };
  };

  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AUTH_SERVICE_TOKEN = 'token';
    process.env.NOTIFICATION_SERVICE_TOKEN = 'ingest';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('probes the inventory route and posts an accepted verdict', async () => {
    const calls: string[] = [];
    globalThis.fetch = jest.fn(async (url: any) => {
      calls.push(String(url));
      if (String(url).endsWith('/api/credentials/report')) return { ok: true, status: 201 } as any;
      return { status: 200 } as any;
    }) as any;

    const { reporter, logging } = build();
    const out = await reporter.runReport();

    expect(out).toEqual({ verdict: 'accepted', posted: true });
    // The probe target must be a route that actually enforces this credential's
    // role — not an unauthenticated /health, which would return 200 for a
    // service holding no credential at all.
    expect(calls[0]).toContain('/internal/service-principals');
    expect(logging.log).toHaveBeenCalledWith(
      'info',
      'credential_self_report_sent',
      expect.objectContaining({ verdict: 'accepted', posted: true }),
    );
  });

  it('reports a rejection when the receiver refuses the credential', async () => {
    globalThis.fetch = jest.fn(async (url: any) => {
      if (String(url).endsWith('/api/credentials/report')) return { ok: true, status: 201 } as any;
      return { status: 401 } as any;
    }) as any;

    const { reporter } = build();
    const out = await reporter.runReport();

    expect(out).toEqual({ verdict: 'rejected', posted: true });
  });

  it('classifies an unreachable receiver as indeterminate, never rejected', async () => {
    globalThis.fetch = jest.fn(async (url: any) => {
      if (String(url).endsWith('/api/credentials/report')) return { ok: true, status: 201 } as any;
      throw new Error('ETIMEDOUT');
    }) as any;

    const { reporter } = build();
    const out = await reporter.runReport();

    // A receiver being down is a health problem HealthWatcher already owns.
    expect(out).toEqual({ verdict: 'indeterminate', posted: true });
  });

  it('logs loudly when the ingest credential is missing, rather than skipping', async () => {
    process.env.NOTIFICATION_SERVICE_TOKEN = '';
    const { reporter, logging } = build();

    const out = await reporter.runReport();

    expect(out).toBeNull();
    expect(logging.log).toHaveBeenCalledWith(
      'error',
      'credential_self_report_undeliverable',
      expect.objectContaining({ reason: expect.stringContaining('NOTIFICATION_SERVICE_TOKEN') }),
    );
  });

  it('reports rejected when its own credential is absent, without calling the receiver', async () => {
    process.env.AUTH_SERVICE_TOKEN = '';
    const calls: string[] = [];
    globalThis.fetch = jest.fn(async (url: any) => {
      calls.push(String(url));
      return { ok: true, status: 201 } as any;
    }) as any;

    const { reporter } = build();
    const out = await reporter.runReport();

    // catalog-contract-monitor shape: an empty credential is a finding, and
    // there is nothing to ask the receiver about.
    expect(out).toEqual({ verdict: 'rejected', posted: true });
    expect(calls.every((c) => c.endsWith('/api/credentials/report'))).toBe(true);
  });

  it('does not throw when monitoring itself is unreachable', async () => {
    globalThis.fetch = jest.fn(async (url: any) => {
      if (String(url).endsWith('/api/credentials/report')) throw new Error('monitoring down');
      return { status: 200 } as any;
    }) as any;

    const { reporter } = build();
    const out = await reporter.runReport();

    // Observability must not become an availability risk for its own host.
    expect(out).toEqual({ verdict: 'accepted', posted: false });
  });

  it('honours the disable switch', async () => {
    globalThis.fetch = jest.fn(async () => ({ status: 200 }) as any) as any;
    process.env.CREDENTIAL_SELF_REPORT_ENABLED = 'false';

    const { reporter } = build();
    await reporter.scheduledReport();

    expect(globalThis.fetch).not.toHaveBeenCalled();
    delete process.env.CREDENTIAL_SELF_REPORT_ENABLED;
  });
});
