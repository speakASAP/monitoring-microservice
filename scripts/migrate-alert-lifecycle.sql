-- migrate-alert-lifecycle.sql
--
-- Stateful alerting: an alert has a lifecycle (fire -> repeat -> resolve)
-- instead of one row per notification. Additive only -- no column dropped, no
-- existing row rewritten beyond backfilling new defaults.
--
-- WHY THIS IS NEEDED (measured 2026-08-26, production):
--   326,745 rows in monitoring.alerts, ALL of them status='active', zero
--   resolved. Alertmanager is configured with send_resolved: true and has been
--   posting resolve events since 2026-05-30, but the webhook handler only
--   logged them, so no alert has ever been closed. Separately,
--   repeat_interval: 4h means every still-firing alert re-POSTs every 4 hours
--   and AlertsService.create() inserted a brand new row each time --
--   324,835 of those rows are a single alertname/service pair.
--
-- IDENTITY: Alertmanager sends a per-alert `fingerprint` (a stable hash of the
-- alert's label set). That, not (alertname, service), is the correct dedup key.
-- The existing `service` column holds the Prometheus *job* label
-- (kube-state-metrics, blackbox-http) -- the scraper, not the affected app --
-- so deduping on it would collapse many genuinely distinct broken pods into one
-- row. Rows predating this migration have no fingerprint and are left alone.

ALTER TABLE monitoring.alerts
  ADD COLUMN IF NOT EXISTS "fingerprint"     VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "lastFiredAt"     TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "resolvedAt"      TIMESTAMP;

-- Existing rows have fired exactly once, at "firedAt", as far as we know.
UPDATE monitoring.alerts
   SET "lastFiredAt" = "firedAt"
 WHERE "lastFiredAt" IS NULL;

-- At most ONE active alert per fingerprint. The upsert in AlertsService.fire()
-- targets this index, making a duplicate active row impossible even when two
-- sources fire concurrently. Partial and WHERE fingerprint IS NOT NULL so the
-- 326k legacy rows (no fingerprint) neither block creation nor get collapsed.
CREATE UNIQUE INDEX IF NOT EXISTS uq_alerts_active_fingerprint
  ON monitoring.alerts ("fingerprint")
  WHERE status = 'active' AND "fingerprint" IS NOT NULL;

-- Drives findActive() and the digest block appended to every notification.
CREATE INDEX IF NOT EXISTS idx_alerts_status_fired
  ON monitoring.alerts (status, "firedAt" DESC);
