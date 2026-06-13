export default () => ({
  port: parseInt(process.env.PORT || '3395', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  db: {
    host: process.env.DB_HOST || 'db-server-postgres',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'monitoring',
  },
  auth: { url: process.env.AUTH_SERVICE_URL || 'http://auth-microservice:3370' },
  monitoring: {
    publicUrl: process.env.MONITORING_PUBLIC_URL || 'https://monitoring.alfares.cz',
    adminRoles:
      process.env.MONITORING_ADMIN_ROLES ||
      'global:superadmin,global:platform_admin,monitoring:admin,app:monitoring:admin',
  },
  logging: { url: process.env.LOGGING_SERVICE_URL || 'http://logging-microservice:3367' },
  notifications: { url: process.env.NOTIFICATION_SERVICE_URL || 'http://notifications-microservice:3368' },
  prometheus: { url: process.env.PROMETHEUS_URL || 'http://prometheus:9090' },
  grafana: { url: process.env.GRAFANA_URL || 'http://grafana:3000' },
  loki: { url: process.env.LOKI_URL || 'http://loki:3100' },
  alertmanager: { url: process.env.ALERTMANAGER_URL || 'http://alertmanager:9093' },
  jwtSecret: process.env.JWT_SECRET || '',
  digest: {
    enabled: process.env.DAILY_DIGEST_ENABLED !== 'false',
    cron: process.env.DAILY_DIGEST_CRON || '0 8 * * *',
    telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
    notificationsToken: process.env.NOTIFICATION_SERVICE_TOKEN || '',
  },
});
