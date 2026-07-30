export class ServiceStatusDto {
  name: string;
  port: number;
  domain: string;
  category: string;
  kind: string;
  monitorable: boolean;
  internalUrl: string;
  healthy: boolean;
  responseTimeMs: number;
  lastChecked: string;
  error?: string;
  /**
   * Why the check failed, when it did:
   *   'config'      — the endpoint answered, but the healthPath is wrong
   *                   (404/405). The service is almost certainly fine; the
   *                   registry entry is not. Fix ecosystem-services.ts.
   *   'unreachable' — nothing answered (DNS, refused, timeout). Real outage.
   *   'unhealthy'   — the endpoint answered with some other failure status.
   */
  failureKind?: 'config' | 'unreachable' | 'unhealthy';
}
