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
}
