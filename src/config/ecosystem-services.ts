export type EcosystemServiceKind = 'service' | 'repository';

export interface EcosystemServiceDefinition {
  name: string;
  port: number;
  domain: string;
  category: string;
  kind: EcosystemServiceKind;
  healthPath?: string;
  monitorable?: boolean;
}

/** Single registry for all ecosystem apps, microservices, and git repos. */
export const ECOSYSTEM_SERVICES: EcosystemServiceDefinition[] = [
  // Infrastructure
  { name: 'auth-microservice', port: 3370, domain: 'auth.alfares.cz', category: 'infrastructure', kind: 'service' },
  { name: 'logging-microservice', port: 3367, domain: 'logging.alfares.cz', category: 'infrastructure', kind: 'service' },
  { name: 'notifications-microservice', port: 3368, domain: 'notifications.alfares.cz', category: 'infrastructure', kind: 'service' },
  { name: 'ai-microservice', port: 3380, domain: 'ai.alfares.cz', category: 'infrastructure', kind: 'service' },
  { name: 'minio-microservice', port: 9000, domain: 'minio.alfares.cz', category: 'infrastructure', kind: 'service', healthPath: '/minio/health/live' },
  // /health is a shallow liveness handler that returns 200 whenever the web
  // process is up; /api/health is the real check (Postgres + Redis). Probing
  // the default hid a 3-day Postgres outage after the 2026-08-14 dbadmin
  // rotation -- 503 with postgres.healthy=false, reported green throughout.
  { name: 'database-server-frontend', port: 3390, domain: 'database-server.alfares.cz', category: 'infrastructure', kind: 'service', healthPath: '/api/health' },
  { name: 'vault-microservice', port: 8200, domain: 'vault.alfares.cz', category: 'infrastructure', kind: 'service', healthPath: '/v1/sys/health', monitorable: false },
  { name: 'monitoring-microservice', port: 3395, domain: 'monitoring.alfares.cz', category: 'infrastructure', kind: 'service' },
  { name: 'monitoring-web', port: 3396, domain: 'monitoring.alfares.cz', category: 'infrastructure', kind: 'service', healthPath: '/' },
  { name: 'backups-microservice', port: 3398, domain: 'backups.alfares.cz', category: 'infrastructure', kind: 'service' },
  { name: 'docs-rag-microservice', port: 3397, domain: 'docs-rag.alfares.cz', category: 'infrastructure', kind: 'service' },

  // E-commerce backbone
  { name: 'catalog-microservice', port: 3200, domain: 'catalog.alfares.cz', category: 'ecommerce', kind: 'service' },
  { name: 'warehouse-microservice', port: 3201, domain: 'warehouse.alfares.cz', category: 'ecommerce', kind: 'service', healthPath: '/api/health' },
  { name: 'orders-microservice', port: 3203, domain: 'orders.alfares.cz', category: 'ecommerce', kind: 'service' },
  { name: 'invoices-microservice', port: 3204, domain: 'invoices.alfares.cz', category: 'ecommerce', kind: 'service' },
  { name: 'payments-microservice', port: 3468, domain: 'payments.alfares.cz', category: 'ecommerce', kind: 'service' },
  { name: 'suppliers-microservice', port: 3202, domain: 'suppliers.alfares.cz', category: 'ecommerce', kind: 'service', healthPath: '/api/health' },

  // Business services
  { name: 'leads-microservice', port: 4400, domain: 'leads.alfares.cz', category: 'business', kind: 'service' },
  { name: 'marketing-microservice', port: 4600, domain: 'marketing.alfares.cz', category: 'business', kind: 'service' },
  { name: 'prompts-microservice', port: 4750, domain: 'prompts.alfares.cz', category: 'business', kind: 'service' },
  { name: 'agentic-email-processing-system', port: 3374, domain: 'aeps.alfares.cz', category: 'business', kind: 'service' },
  { name: 'business-process-control-plane', port: 3375, domain: '-', category: 'business', kind: 'service', monitorable: false },
  { name: 'allegro-service', port: 3000, domain: 'allegro.alfares.cz', category: 'business', kind: 'service' },
  { name: 'aukro-service', port: 3700, domain: 'aukro.alfares.cz', category: 'business', kind: 'service' },
  { name: 'bazos-service', port: 3000, domain: 'bazos.alfares.cz', category: 'business', kind: 'service' },
  { name: 'heureka-service', port: 3800, domain: 'heureka.alfares.cz', category: 'business', kind: 'service' },

  // Orchestration
  { name: 'runlayer', port: 3390, domain: 'runlayer.alfares.cz', category: 'orchestration', kind: 'service' },
  { name: 'goalkeeper', port: 3392, domain: 'goalkeeper.alfares.cz', category: 'orchestration', kind: 'service' },

  // Applications
  { name: 'flipflop-service', port: 3000, domain: 'flipflop.alfares.cz', category: 'application', kind: 'service' },
  { name: 'chytrakoupe-storefront', port: 3000, domain: 'chytrakoupe.alfares.cz', category: 'application', kind: 'service', healthPath: '/api/health' },
  { name: 'cliplot', port: 8080, domain: 'cliplot.alfares.cz', category: 'application', kind: 'service' },
  { name: 'rent-a-box-web', port: 3000, domain: 'rent-a-box.alfares.cz', category: 'application', kind: 'service', healthPath: '/api/health' },
  { name: 'rent-a-box-api', port: 8000, domain: 'rent-a-box.alfares.cz', category: 'application', kind: 'service' },
  { name: 'crypto-ai-agent', port: 3000, domain: 'crypto-ai-agent.alfares.cz', category: 'application', kind: 'service', healthPath: '/api/health' },
  { name: 'marathon', port: 3000, domain: 'marathon.alfares.cz', category: 'application', kind: 'service' },
  { name: 'sgiprealestate', port: 4300, domain: 'sgiprealestate.alfares.cz', category: 'application', kind: 'repository' },
  { name: 'shop-assistant', port: 4500, domain: 'shop-assistant.alfares.cz', category: 'application', kind: 'service' },
  // /health and /healthz are ordinary Next.js PAGE routes here and redirect to
  // /login -- they were never health endpoints. The real ones are public and
  // unauthenticated: /api/health/live (process up) and /api/health/ready, which
  // also checks AUTH_SERVICE_BASE_URL, DB_HOST and LOGGING_SERVICE_URL. Using
  // 'ready' for the deeper signal; nothing restarts on this, it feeds the digest.
  { name: 'school-committee', port: 4800, domain: 'strilkove.cz', category: 'application', kind: 'service', healthPath: '/api/health/ready' },
  { name: 'candidate-blueprism', port: 4850, domain: 'candidate-blueprism.alfares.cz', category: 'application', kind: 'service', healthPath: '/' },
  { name: 'domain-research', port: 4860, domain: 'domain-research.alfares.cz', category: 'application', kind: 'service' },
  { name: 'statex', port: 3000, domain: 'alfares.cz', category: 'application', kind: 'service', healthPath: '/api/health' },
  { name: 'wisdom-quotes', port: 4720, domain: 'wisdom-quotes.alfares.cz', category: 'application', kind: 'service' },
  { name: 'speakasap', port: 3000, domain: 'speakasap.alfares.cz', category: 'application', kind: 'service' },
  { name: 'speakasap-portal', port: 0, domain: 'speakasap-portal', category: 'application', kind: 'repository' },

  // Speakasap microservices (42xx)
  { name: 'speakasap-content', port: 4201, domain: 'speakasap.alfares.cz', category: 'speakasap', kind: 'service' },
  { name: 'speakasap-certification', port: 4202, domain: 'speakasap.alfares.cz', category: 'speakasap', kind: 'service' },
  { name: 'speakasap-assessment', port: 4203, domain: 'speakasap.alfares.cz', category: 'speakasap', kind: 'service' },
  { name: 'speakasap-course', port: 4205, domain: 'speakasap.alfares.cz', category: 'speakasap', kind: 'service' },
  { name: 'speakasap-education', port: 4206, domain: 'speakasap.alfares.cz', category: 'speakasap', kind: 'service' },
  { name: 'speakasap-user', port: 4207, domain: 'speakasap.alfares.cz', category: 'speakasap', kind: 'service' },
  { name: 'speakasap-payment', port: 4208, domain: 'speakasap.alfares.cz', category: 'speakasap', kind: 'service' },
  { name: 'speakasap-notification', port: 4209, domain: 'speakasap.alfares.cz', category: 'speakasap', kind: 'service' },
  { name: 'speakasap-api-gateway', port: 4210, domain: 'speakasap.alfares.cz', category: 'speakasap', kind: 'service' },
  { name: 'speakasap-salary', port: 4212, domain: 'speakasap.alfares.cz', category: 'speakasap', kind: 'service' },
  { name: 'speakasap-financial', port: 4213, domain: 'speakasap.alfares.cz', category: 'speakasap', kind: 'service' },

  // Static / catalog sites
  { name: 'rehtani', port: 4601, domain: 'rehtani.alfares.cz', category: 'static', kind: 'service', healthPath: '/' },
  { name: 'statex-ecosystem', port: 4710, domain: 'statex-ecosystem.alfares.cz', category: 'static', kind: 'service', healthPath: '/api/health' },

  // Hub / git repos (no runtime)
  { name: 'shared', port: 0, domain: '-', category: 'hub', kind: 'repository' },
  { name: 'k8s-manifests', port: 0, domain: '-', category: 'hub', kind: 'repository' },
  { name: 'vault', port: 0, domain: '-', category: 'hub', kind: 'repository' },
  { name: 'company-evidence-platform-docs', port: 0, domain: '-', category: 'hub', kind: 'repository' },
];

export function getMonitorableServices(): EcosystemServiceDefinition[] {
  return ECOSYSTEM_SERVICES.filter((s) => s.kind === 'service' && s.port > 0 && s.monitorable !== false);
}

export function buildHealthUrl(name: string, port: number, healthPath = '/health'): string {
  return `http://${name}:${port}${healthPath}`;
}

export function buildInternalUrl(name: string, port: number): string {
  return `http://${name}.statex-apps.svc.cluster.local:${port}`;
}
