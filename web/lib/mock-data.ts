export const MOCK_SERVICES = [
  { name: 'auth-microservice', category: 'infrastructure', healthy: true, responseTimeMs: 45, domain: 'auth.alfares.cz' },
  { name: 'logging-microservice', category: 'infrastructure', healthy: true, responseTimeMs: 32, domain: 'logging.alfares.cz' },
  { name: 'notifications-microservice', category: 'infrastructure', healthy: true, responseTimeMs: 28, domain: 'notifications.alfares.cz' },
  { name: 'ai-microservice', category: 'infrastructure', healthy: true, responseTimeMs: 120, domain: 'ai.alfares.cz' },
  { name: 'minio-microservice', category: 'infrastructure', healthy: true, responseTimeMs: 15, domain: 'minio.alfares.cz' },
  { name: 'catalog-microservice', category: 'ecommerce', healthy: true, responseTimeMs: 55, domain: 'catalog.alfares.cz' },
  { name: 'warehouse-microservice', category: 'ecommerce', healthy: true, responseTimeMs: 62, domain: 'warehouse.alfares.cz' },
  { name: 'orders-microservice', category: 'ecommerce', healthy: true, responseTimeMs: 48, domain: 'orders.alfares.cz' },
  { name: 'payments-microservice', category: 'ecommerce', healthy: true, responseTimeMs: 38, domain: 'payments.alfares.cz' },
  { name: 'allegro-service', category: 'business', healthy: true, responseTimeMs: 52, domain: 'allegro.alfares.cz' },
  { name: 'heureka-service', category: 'business', healthy: true, responseTimeMs: 44, domain: 'heureka.alfares.cz' },
  { name: 'runlayer', category: 'orchestration', healthy: true, responseTimeMs: 95, domain: 'runlayer.alfares.cz' },
  { name: 'leads-microservice', category: 'business', healthy: true, responseTimeMs: 41, domain: 'leads.alfares.cz' },
  { name: 'marketing-microservice', category: 'business', healthy: true, responseTimeMs: 58, domain: 'marketing.alfares.cz' },
  { name: 'speakasap-api-gateway', category: 'speakasap', healthy: true, responseTimeMs: 63, domain: 'speakasap.alfares.cz' },
  { name: 'statex-ecosystem', category: 'static', healthy: true, responseTimeMs: 22, domain: 'statex-ecosystem.alfares.cz' },
  { name: 'shared', category: 'hub', healthy: true, responseTimeMs: 0, domain: '-' },
  { name: 'shop-assistant', category: 'application', healthy: false, responseTimeMs: 0, domain: 'shop-assistant.alfares.cz', error: 'Connection timeout' },
];

export const MOCK_ALERTS = [
  { id: '1', alertname: 'HighMemoryUsage', service: 'ai-microservice', severity: 'warning', message: 'Memory usage at 82%', status: 'active', firedAt: new Date(Date.now() - 15 * 60000).toISOString() },
  { id: '2', alertname: 'ServiceDown', service: 'shop-assistant', severity: 'critical', message: 'shop-assistant is unreachable', status: 'active', firedAt: new Date(Date.now() - 5 * 60000).toISOString() },
];

export const MOCK_SUMMARY = {
  total: MOCK_SERVICES.length,
  healthy: MOCK_SERVICES.filter(s => s.healthy).length,
  unhealthy: MOCK_SERVICES.filter(s => !s.healthy).length,
  activeAlerts: MOCK_ALERTS.length,
};
