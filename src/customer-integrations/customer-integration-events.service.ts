import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, timingSafeEqual } from 'crypto';
import { Repository } from 'typeorm';
import { MonitoringAuthUser } from '../auth/auth-consumer.service';
import { CustomerIntegrationEvent } from './customer-integration-event.entity';
import { CustomerIntegration } from './customer-integration.entity';
import { CreateCustomerIntegrationEventDto } from './dto/create-customer-integration-event.dto';
import { toCustomerIntegrationEventResponse } from './dto/customer-integration-event-response.dto';

@Injectable()
export class CustomerIntegrationEventsService {
  constructor(
    @InjectRepository(CustomerIntegration) private readonly integrations: Repository<CustomerIntegration>,
    @InjectRepository(CustomerIntegrationEvent) private readonly events: Repository<CustomerIntegrationEvent>,
  ) {}

  async onModuleInit() {
    await this.events.query(`
      CREATE TABLE IF NOT EXISTS monitoring.customer_integration_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "integrationId" UUID NOT NULL,
        "ownerUserId" VARCHAR NOT NULL,
        source VARCHAR NOT NULL DEFAULT 'ingest',
        "eventType" VARCHAR NOT NULL DEFAULT 'event',
        "eventId" VARCHAR,
        status VARCHAR NOT NULL DEFAULT 'unknown',
        severity VARCHAR NOT NULL DEFAULT 'info',
        message TEXT,
        "payloadSummary" JSONB,
        "observedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await this.events.query('CREATE INDEX IF NOT EXISTS idx_customer_integration_events_integration ON monitoring.customer_integration_events ("integrationId", "createdAt" DESC);');
    await this.events.query('CREATE INDEX IF NOT EXISTS idx_customer_integration_events_owner ON monitoring.customer_integration_events ("ownerUserId", "createdAt" DESC);');
    await this.events.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_integration_events_event_id ON monitoring.customer_integration_events ("integrationId", "eventId") WHERE "eventId" IS NOT NULL;');
  }

  async recordEvent(apiKeyId: string, rawKey: string | undefined, source: 'ingest' | 'webhook', dto: CreateCustomerIntegrationEventDto) {
    const integration = await this.authenticateIntegration(apiKeyId, rawKey);
    const eventId = this.cleanText(dto.eventId, 160);
    if (eventId) {
      const existing = await this.events.findOne({ where: { integrationId: integration.id, eventId } });
      if (existing) {
        return { ok: true, duplicate: true, event: toCustomerIntegrationEventResponse(existing) };
      }
    }

    const event = this.events.create({
      integrationId: integration.id,
      ownerUserId: integration.ownerUserId,
      source,
      eventType: this.cleanText(dto.eventType, 80) || (source === 'webhook' ? 'webhook' : 'health'),
      eventId,
      status: this.normalize(dto.status, ['healthy', 'degraded', 'failing', 'resolved', 'event', 'unknown'], 'unknown'),
      severity: this.normalize(dto.severity, ['info', 'warning', 'critical'], 'info'),
      message: this.cleanText(dto.message, 1000),
      observedAt: this.parseDate(dto.observedAt),
      payloadSummary: this.sanitizeDetails(dto.details),
    });

    const saved = await this.events.save(event);
    return { ok: true, event: toCustomerIntegrationEventResponse(saved) };
  }

  async listEvents(user: MonitoringAuthUser, integrationId: string) {
    const integration = await this.integrations.findOne({ where: { id: integrationId, ownerUserId: user.id } });
    if (!integration) throw new NotFoundException('Integration not found');
    const events = await this.events.find({
      where: { integrationId, ownerUserId: user.id },
      order: { createdAt: 'DESC' },
      take: 25,
    });
    return events.map(toCustomerIntegrationEventResponse);
  }

  extractBearerKey(authorization?: string, fallbackKey?: string) {
    if (authorization?.startsWith('Bearer ')) {
      const key = authorization.slice('Bearer '.length).trim();
      if (key) return key;
    }
    return fallbackKey?.trim() || undefined;
  }

  private async authenticateIntegration(apiKeyId: string, rawKey?: string) {
    if (!apiKeyId || !rawKey) throw new UnauthorizedException('Unauthorized');
    const integration = await this.integrations.findOne({ where: { apiKeyId } });
    if (!integration || integration.status !== 'active' || !integration.apiKeyHash) {
      throw new UnauthorizedException('Unauthorized');
    }

    if (!this.hashMatches(rawKey, integration.apiKeyHash)) {
      throw new UnauthorizedException('Unauthorized');
    }

    return integration;
  }

  private hashMatches(rawKey: string, expectedHash: string) {
    const actual = createHash('sha256').update(rawKey).digest('hex');
    const actualBuffer = Buffer.from(actual, 'hex');
    const expectedBuffer = Buffer.from(expectedHash, 'hex');
    if (actualBuffer.length !== expectedBuffer.length) return false;
    return timingSafeEqual(actualBuffer, expectedBuffer);
  }

  private normalize(value: string | undefined, allowed: string[], fallback: string) {
    if (!value) return fallback;
    return allowed.includes(value) ? value : fallback;
  }

  private parseDate(value?: string) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private cleanText(value: string | undefined, maxLength: number) {
    if (!value) return null;
    return value.slice(0, maxLength);
  }

  private sanitizeDetails(details?: Record<string, unknown>) {
    if (!details || typeof details !== 'object') return null;
    const blocked = new Set(['authorization', 'apikey', 'api_key', 'token', 'secret', 'password']);
    const summary: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(details).slice(0, 20)) {
      if (blocked.has(key.toLowerCase())) continue;
      if (['string', 'number', 'boolean'].includes(typeof value)) {
        summary[key] = typeof value === 'string' ? value.slice(0, 240) : value;
      }
    }

    return Object.keys(summary).length ? summary : null;
  }
}
