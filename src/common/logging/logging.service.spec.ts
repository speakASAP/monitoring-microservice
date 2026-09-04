import axios from 'axios';
import { LoggingService } from './logging.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

/**
 * This service posted every log line without an Authorization header, so
 * logging-microservice answered 401 "Logging ingest credential required" and
 * dropped it — while `log()`'s bare `catch { return; }` hid the rejection.
 * monitoring-microservice therefore had ZERO rows in the log index for
 * 2026-08-25..09-04, which is why the nine-day digest outage could not be
 * diagnosed after the fact. Verified against the live pod: 401 without the
 * header, 201 with it.
 */
describe('LoggingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.post.mockResolvedValue({ status: 201 } as any);
  });

  function build(token?: string) {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'logging.url') return 'http://logging-microservice:3367';
        if (key === 'logging.token') return token;
        return undefined;
      }),
    };
    return new LoggingService(config as any);
  }

  it('authenticates the ingest request when a token is configured', async () => {
    await build('tok-123').log('error', 'daily_digest_failed', { date: '2026-09-04' });

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    const [, , options] = mockedAxios.post.mock.calls[0];
    expect((options as any)?.headers?.Authorization).toBe('Bearer tok-123');
  });

  it('sends the log payload with the service name and level', async () => {
    await build('tok-123').log('error', 'daily_digest_failed', { date: '2026-09-04' });

    const [url, payload] = mockedAxios.post.mock.calls[0];
    expect(url).toContain('/api/logs');
    expect(payload).toMatchObject({
      service: 'monitoring-microservice',
      level: 'error',
      msg: 'daily_digest_failed',
      date: '2026-09-04',
    });
  });

  it('omits the header rather than sending "Bearer undefined" when unconfigured', async () => {
    await build(undefined).log('info', 'x');

    const [, , options] = mockedAxios.post.mock.calls[0];
    expect((options as any)?.headers?.Authorization).toBeUndefined();
  });

  it('never throws out of log() — logging must not break the caller', async () => {
    mockedAxios.post.mockRejectedValue(new Error('connection refused'));

    await expect(build('tok-123').log('error', 'x')).resolves.toBeUndefined();
  });
});
