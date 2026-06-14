import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { MonitoringAuthUser } from '../auth/auth-consumer.service';
import { CustomerIntegration } from './customer-integration.entity';
import { CreateCustomerIntegrationDto } from './dto/create-customer-integration.dto';
import { UpdateCustomerIntegrationDto } from './dto/update-customer-integration.dto';

@Injectable()
export class CustomerIntegrationsService implements OnModuleInit {
  constructor(
    @InjectRepository(CustomerIntegration) private readonly repo: Repository<CustomerIntegration>,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.repo.query(`
      CREATE TABLE IF NOT EXISTS monitoring.customer_integrations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "ownerUserId" VARCHAR NOT NULL,
        "ownerEmail" VARCHAR,
        name VARCHAR NOT NULL,
        "serviceType" VARCHAR NOT NULL DEFAULT 'custom',
        "endpointType" VARCHAR NOT NULL DEFAULT 'https',
        "baseUrl" VARCHAR NOT NULL,
        "healthPath" VARCHAR NOT NULL DEFAULT '/health',
        "webhookPath" VARCHAR,
        status VARCHAR NOT NULL DEFAULT 'active',
        "apiKeyId" VARCHAR,
        "apiKeyHash" VARCHAR,
        "apiKeyPreview" VARCHAR,
        notes TEXT,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await this.repo.query('CREATE INDEX IF NOT EXISTS idx_customer_integrations_owner ON monitoring.customer_integrations ("ownerUserId");');
  }

  async list(user: MonitoringAuthUser) {
    const integrations = await this.repo.find({ where: { ownerUserId: user.id }, order: { updatedAt: 'DESC' } });
    return integrations.map((integration) => this.withConnectionDetails(integration));
  }

  async create(user: MonitoringAuthUser, dto: CreateCustomerIntegrationDto) {
    const key = this.generateApiKey();
    const integration = this.repo.create({
      ownerUserId: user.id,
      ownerEmail: user.email || null,
      name: dto.name,
      serviceType: dto.serviceType || 'custom',
      endpointType: dto.endpointType || 'https',
      baseUrl: dto.baseUrl,
      healthPath: dto.healthPath || '/health',
      webhookPath: dto.webhookPath || '/webhooks/monitoring',
      notes: dto.notes || null,
      apiKeyId: key.id,
      apiKeyHash: this.hashKey(key.value),
      apiKeyPreview: this.previewKey(key.value),
    });
    const saved = await this.repo.save(integration);
    return this.withConnectionDetails(saved, key.value);
  }

  async update(user: MonitoringAuthUser, id: string, dto: UpdateCustomerIntegrationDto) {
    const integration = await this.findOwned(user, id);
    const allowedFields: Array<keyof UpdateCustomerIntegrationDto> = [
      'name',
      'serviceType',
      'endpointType',
      'baseUrl',
      'healthPath',
      'webhookPath',
      'notes',
    ];

    for (const field of allowedFields) {
      if (dto[field] !== undefined) {
        integration[field] = dto[field];
      }
    }

    return this.withConnectionDetails(await this.repo.save(integration));
  }

  async rotateKey(user: MonitoringAuthUser, id: string) {
    const integration = await this.findOwned(user, id);
    const key = this.generateApiKey();
    integration.apiKeyId = key.id;
    integration.apiKeyHash = this.hashKey(key.value);
    integration.apiKeyPreview = this.previewKey(key.value);
    const saved = await this.repo.save(integration);
    return this.withConnectionDetails(saved, key.value);
  }

  async remove(user: MonitoringAuthUser, id: string) {
    const integration = await this.findOwned(user, id);
    await this.repo.remove(integration);
    return { ok: true };
  }

  private async findOwned(user: MonitoringAuthUser, id: string) {
    const integration = await this.repo.findOne({ where: { id, ownerUserId: user.id } });
    if (!integration) throw new NotFoundException('Integration not found');
    return integration;
  }

  private withConnectionDetails(integration: CustomerIntegration, apiKey?: string) {
    const publicUrl = (this.config.get<string>('monitoring.publicUrl') || 'https://monitoring.alfares.cz').replace(/\/$/, '');
    const response = {
      id: integration.id,
      ownerUserId: integration.ownerUserId,
      ownerEmail: integration.ownerEmail,
      name: integration.name,
      serviceType: integration.serviceType,
      endpointType: integration.endpointType,
      baseUrl: integration.baseUrl,
      healthPath: integration.healthPath,
      webhookPath: integration.webhookPath,
      status: integration.status,
      apiKeyId: integration.apiKeyId,
      apiKeyPreview: integration.apiKeyPreview,
      notes: integration.notes,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
      ingestEndpoint: `${publicUrl}/api/ingest/${integration.apiKeyId || 'key-id'}`,
      webhookEndpoint: `${publicUrl}/api/customer/webhooks/${integration.apiKeyId || 'key-id'}`,
    };

    if (apiKey) {
      return { ...response, apiKey };
    }

    return response;
  }

  private generateApiKey() {
    const id = `mon_${randomBytes(6).toString('hex')}`;
    return { id, value: `${id}_${randomBytes(24).toString('hex')}` };
  }

  private hashKey(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private previewKey(value: string) {
    return `${value.slice(0, 12)}...${value.slice(-4)}`;
  }
}
