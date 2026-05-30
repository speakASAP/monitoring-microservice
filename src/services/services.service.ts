import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  buildInternalUrl,
  ECOSYSTEM_SERVICES,
  EcosystemServiceDefinition,
} from '../config/ecosystem-services';
import { ServiceStatusDto } from './dto/service-status.dto';

@Injectable()
export class ServicesService {
  constructor(private config: ConfigService) {}

  getEcosystemServices() {
    return ECOSYSTEM_SERVICES.map((s) => ({
      ...s,
      monitorable: s.kind === 'service' && s.port > 0,
      internalUrl: s.port > 0 ? buildInternalUrl(s.name, s.port) : '',
    }));
  }

  async checkServiceHealth(
    svc: EcosystemServiceDefinition,
    internalUrl: string,
  ): Promise<{ healthy: boolean; responseTimeMs: number; error?: string }> {
    const start = Date.now();
    const healthPath = svc.healthPath || '/health';
    try {
      await axios.get(`${internalUrl}${healthPath}`, { timeout: 5000 });
      return { healthy: true, responseTimeMs: Date.now() - start };
    } catch (err: any) {
      return { healthy: false, responseTimeMs: Date.now() - start, error: err.message };
    }
  }

  async getServicesStatus(): Promise<ServiceStatusDto[]> {
    const services = this.getEcosystemServices();
    const results = await Promise.allSettled(
      services.map(async (svc) => {
        const base = {
          name: svc.name,
          port: svc.port,
          domain: svc.domain,
          category: svc.category,
          kind: svc.kind,
          monitorable: svc.monitorable,
          internalUrl: svc.internalUrl,
          lastChecked: new Date().toISOString(),
        };

        if (!svc.monitorable) {
          return {
            ...base,
            healthy: true,
            responseTimeMs: 0,
          } as ServiceStatusDto;
        }

        const health = await this.checkServiceHealth(svc, svc.internalUrl);
        return { ...base, ...health } as ServiceStatusDto;
      }),
    );

    return results.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : ({
            ...services[i],
            kind: services[i].kind,
            monitorable: services[i].monitorable,
            healthy: false,
            responseTimeMs: 0,
            lastChecked: new Date().toISOString(),
            error: 'check failed',
          } as ServiceStatusDto),
    );
  }
}
