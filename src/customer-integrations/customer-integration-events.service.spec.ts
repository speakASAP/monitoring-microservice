import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { CustomerIntegrationEventsService } from './customer-integration-events.service';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

function makeRepo(overrides: any = {}) {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: 'evt_1', createdAt: new Date('2026-06-15T00:00:00.000Z'), ...value })),
    query: jest.fn(),
    ...overrides,
  };
}

describe('CustomerIntegrationEventsService', () => {
  it('records sanitized events for a valid bearer key', async () => {
    const integrations = makeRepo({
      findOne: jest.fn(async () => ({
        id: 'integration-1',
        ownerUserId: 'user-1',
        status: 'active',
        apiKeyHash: hash('mon_key_123'),
      })),
    });
    const events = makeRepo();
    const service = new CustomerIntegrationEventsService(integrations as any, events as any);

    const result = await service.recordEvent('mon_123', 'mon_key_123', 'ingest', {
      eventId: 'evt-synthetic-1',
      eventType: 'health',
      status: 'healthy',
      severity: 'info',
      message: 'Synthetic health accepted',
      details: {
        latencyMs: 42,
        token: 'must-not-persist',
        authorization: 'must-not-persist',
        region: 'example',
      },
    });

    expect(result.ok).toBe(true);
    expect(events.save).toHaveBeenCalledWith(expect.objectContaining({
      integrationId: 'integration-1',
      ownerUserId: 'user-1',
      status: 'healthy',
      payloadSummary: { latencyMs: 42, region: 'example' },
    }));
  });

  it('rejects invalid keys with a generic unauthorized error', async () => {
    const integrations = makeRepo({
      findOne: jest.fn(async () => ({
        id: 'integration-1',
        ownerUserId: 'user-1',
        status: 'active',
        apiKeyHash: hash('expected-key'),
      })),
    });
    const service = new CustomerIntegrationEventsService(integrations as any, makeRepo() as any);

    await expect(service.recordEvent('mon_123', 'wrong-key', 'ingest', {})).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('lists events only after confirming owner scope', async () => {
    const integrations = makeRepo({ findOne: jest.fn(async () => ({ id: 'integration-1', ownerUserId: 'user-1' })) });
    const events = makeRepo({
      find: jest.fn(async () => [{ id: 'evt_1', integrationId: 'integration-1', ownerUserId: 'user-1', source: 'ingest' }]),
    });
    const service = new CustomerIntegrationEventsService(integrations as any, events as any);

    await service.listEvents({ id: 'user-1', roles: [] }, 'integration-1');

    expect(integrations.findOne).toHaveBeenCalledWith({ where: { id: 'integration-1', ownerUserId: 'user-1' } });
    expect(events.find).toHaveBeenCalledWith(expect.objectContaining({
      where: { integrationId: 'integration-1', ownerUserId: 'user-1' },
      take: 25,
    }));
  });

  it('returns the existing event for duplicate synthetic event ids', async () => {
    const existing = {
      id: 'evt-existing',
      integrationId: 'integration-1',
      ownerUserId: 'user-1',
      eventId: 'evt-synthetic-1',
      createdAt: new Date('2026-06-15T00:00:00.000Z'),
    };
    const integrations = makeRepo({
      findOne: jest.fn(async () => ({
        id: 'integration-1',
        ownerUserId: 'user-1',
        status: 'active',
        apiKeyHash: hash('mon_key_123'),
      })),
    });
    const events = makeRepo({
      findOne: jest.fn(async () => existing),
    });
    const service = new CustomerIntegrationEventsService(integrations as any, events as any);

    const result = await service.recordEvent('mon_123', 'mon_key_123', 'ingest', { eventId: 'evt-synthetic-1' });

    expect(result).toEqual({ ok: true, duplicate: true, event: expect.objectContaining({ id: 'evt-existing' }) });
    expect(events.save).not.toHaveBeenCalled();
  });
});
