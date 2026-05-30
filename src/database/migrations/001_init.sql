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
