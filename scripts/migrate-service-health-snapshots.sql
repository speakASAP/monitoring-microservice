CREATE TABLE IF NOT EXISTS monitoring.service_health_snapshots (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE        NOT NULL,
  services      JSONB       NOT NULL DEFAULT '[]',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_service_health_snapshots_date UNIQUE (snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_service_health_snapshots_date
  ON monitoring.service_health_snapshots (snapshot_date DESC);
