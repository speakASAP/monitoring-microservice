import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  buildInternalUrl,
  ECOSYSTEM_SERVICES,
  EcosystemServiceDefinition,
} from '../config/ecosystem-services';
import { ServiceStatusDto } from './dto/service-status.dto';

@Injectable()
export class ServicesService implements OnModuleInit {
  private readonly logger = new Logger(ServicesService.name);

  constructor(private config: ConfigService) {}

  /**
   * Probe every registered service once at startup and loudly separate
   * "your registry entry is wrong" from "the service is down". A misconfigured
   * healthPath otherwise looks identical to a chronic outage in the digest,
   * which is how three healthy services stayed red for days.
   */
  async onModuleInit(): Promise<void> {
    try {
      const statuses = await this.getServicesStatus();
      const misconfigured = statuses.filter((s) => s.failureKind === 'config');
      if (misconfigured.length > 0) {
        this.logger.error(
          `${misconfigured.length} service(s) have a healthPath that 404s — these are REGISTRY BUGS, not outages: ` +
            misconfigured.map((s) => `${s.name} (${s.internalUrl})`).join(', '),
        );
      }
      const unreachable = statuses.filter((s) => s.failureKind === 'unreachable');
      if (unreachable.length > 0) {
        this.logger.warn(
          `${unreachable.length} service(s) unreachable at startup: ` +
            unreachable.map((s) => s.name).join(', '),
        );
      }
      if (misconfigured.length === 0 && unreachable.length === 0) {
        this.logger.log(`All ${statuses.length} registered services responded at startup.`);
      }
    } catch (err: any) {
      // Never block boot on the startup audit -- it is diagnostics, not a gate.
      this.logger.warn(`Startup health audit failed: ${err.message}`);
    }
  }

  getEcosystemServices() {
    return ECOSYSTEM_SERVICES.map((s) => ({
      ...s,
      monitorable: s.kind === 'service' && s.port > 0 && s.monitorable !== false,
      internalUrl: s.port > 0 ? buildInternalUrl(s.name, s.port) : '',
    }));
  }

  async checkServiceHealth(
    svc: EcosystemServiceDefinition,
    internalUrl: string,
  ): Promise<{
    healthy: boolean;
    responseTimeMs: number;
    error?: string;
    failureKind?: ServiceStatusDto['failureKind'];
  }> {
    const start = Date.now();
    const healthPath = svc.healthPath || '/health';
    try {
      // maxRedirects: 0 is load-bearing. A 3xx on a health path is never a
      // healthy answer -- it means something intercepted the probe. Following
      // it silently turns a broken service green: school-committee's auth
      // middleware redirects /health -> /login, and axios (which follows
      // redirects by default) resolved 200 from the LOGIN PAGE, so the service
      // would report healthy with its database down or its backend gone.
      // Throwing on 3xx routes it into the classifier below as 'unhealthy'.
      await axios.get(`${internalUrl}${healthPath}`, { timeout: 5000, maxRedirects: 0 });
      return { healthy: true, responseTimeMs: Date.now() - start };
    } catch (err: any) {
      // A 404/405 means something IS listening and rejected the path -- the
      // service is up and the registry's healthPath is wrong. Reporting that
      // as an outage is what let chytrakoupe-storefront, rent-a-box-web and
      // ecosystem-console sit "failing" in the digest for days while being
      // perfectly healthy (2026-07-28). Frontends here serve /api/health.
      const status = err.response?.status;
      const failureKind =
        status === 404 || status === 405
          ? 'config'
          : status === undefined
            ? 'unreachable'
            : 'unhealthy';
      return {
        healthy: false,
        responseTimeMs: Date.now() - start,
        error:
          failureKind === 'config'
            ? `${err.message} — healthPath '${healthPath}' not found; check the registry entry, not the service`
            : status >= 300 && status < 400
              ? `${err.message} — healthPath '${healthPath}' redirected to '${err.response?.headers?.location ?? 'unknown'}'; the probe was intercepted (auth middleware?) and never reached a health handler`
              : err.message,
        failureKind,
      };
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
