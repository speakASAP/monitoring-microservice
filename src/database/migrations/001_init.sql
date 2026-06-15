CREATE SCHEMA IF NOT EXISTS monitoring;

CREATE TABLE IF NOT EXISTS monitoring.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alertname VARCHAR(255) NOT NULL,
  service VARCHAR(255) NOT NULL,
  severity VARCHAR(50) NOT NULL DEFAULT 'warning',
  message TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  labels TEXT,
  "acknowledgedBy" VARCHAR(255),
  "acknowledgedAt" TIMESTAMP,
  "firedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monitoring.incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  severity VARCHAR(50) NOT NULL DEFAULT 'warning',
  status VARCHAR(50) NOT NULL DEFAULT 'open',
  service VARCHAR(255),
  "resolvedAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

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

CREATE INDEX IF NOT EXISTS idx_customer_integrations_owner
  ON monitoring.customer_integrations ("ownerUserId");

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

CREATE INDEX IF NOT EXISTS idx_customer_integration_events_integration
  ON monitoring.customer_integration_events ("integrationId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_customer_integration_events_owner
  ON monitoring.customer_integration_events ("ownerUserId", "createdAt" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_integration_events_event_id
  ON monitoring.customer_integration_events ("integrationId", "eventId")
  WHERE "eventId" IS NOT NULL;
