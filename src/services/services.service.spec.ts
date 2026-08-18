import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ServicesService } from './services.service';
import { EcosystemServiceDefinition } from '../config/ecosystem-services';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

/**
 * Regression tests for checkServiceHealth's failure classification.
 *
 * This logic has produced three separate incidents, all the same shape -- the
 * probe ran, returned, and looked fine while measuring the wrong thing:
 *   2026-07-28  healthy frontends reported as outages (404 on a wrong healthPath)
 *   2026-08-14  database-server Postgres down 3 days, reported green (shallow 200)
 *   2026-08-17  school-committee /health -> /login, followed, reported green (307)
 *
 * The distinctions asserted here are what separate "registry bug" from "real
 * outage", and what stops a redirect from being read as health.
 */
describe('ServicesService.checkServiceHealth', () => {
  let service: ServicesService;

  const svc = (over: Partial<EcosystemServiceDefinition> = {}) =>
    ({
      name: 'test-service',
      port: 1234,
      domain: 'test.alfares.cz',
      category: 'infrastructure',
      kind: 'service',
      ...over,
    }) as EcosystemServiceDefinition;

  const axiosError = (status?: number, headers: Record<string, string> = {}) =>
    Object.assign(new Error(`Request failed with status code ${status}`), {
      response: status === undefined ? undefined : { status, headers },
    });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ServicesService(new ConfigService());
  });

  it('never follows redirects -- a 3xx health probe was intercepted, not answered', async () => {
    // The bug: axios follows redirects by default, so school-committee's
    // /health -> /login resolved 200 and the service reported HEALTHY with its
    // backend potentially gone. maxRedirects: 0 is what makes this fail.
    mockedAxios.get.mockRejectedValue(axiosError(307, { location: '/login?next=%2Fhealth' }));

    const result = await service.checkServiceHealth(svc(), 'http://test-service:1234');

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'http://test-service:1234/health',
      expect.objectContaining({ maxRedirects: 0 }),
    );
    expect(result.healthy).toBe(false);
    expect(result.failureKind).toBe('unhealthy');
    expect(result.error).toContain('/login?next=%2Fhealth');
  });

  it('classifies 404 as a registry bug, not an outage', async () => {
    mockedAxios.get.mockRejectedValue(axiosError(404));

    const result = await service.checkServiceHealth(svc(), 'http://test-service:1234');

    expect(result.failureKind).toBe('config');
    expect(result.error).toContain('check the registry entry');
  });

  it('classifies 503 as a real outage so it alerts', async () => {
    // database-server-frontend's /api/health returns 503 when Postgres is down.
    // If this ever classified as 'config' the outage would be filed as a
    // registry typo and silently ignored.
    mockedAxios.get.mockRejectedValue(axiosError(503));

    const result = await service.checkServiceHealth(svc(), 'http://test-service:1234');

    expect(result.failureKind).toBe('unhealthy');
  });

  it('classifies a connection failure as unreachable', async () => {
    mockedAxios.get.mockRejectedValue(axiosError(undefined));

    const result = await service.checkServiceHealth(svc(), 'http://test-service:1234');

    expect(result.failureKind).toBe('unreachable');
  });

  it('probes the explicit healthPath when the registry sets one', async () => {
    // database-server-frontend serves shallow liveness on /health and real
    // health on /api/health; probing the default hid a 3-day Postgres outage.
    mockedAxios.get.mockResolvedValue({ status: 200 });

    const result = await service.checkServiceHealth(
      svc({ healthPath: '/api/health' }),
      'http://database-server-frontend:3390',
    );

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'http://database-server-frontend:3390/api/health',
      expect.anything(),
    );
    expect(result.healthy).toBe(true);
  });
});
