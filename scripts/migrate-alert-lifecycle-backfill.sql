-- migrate-alert-lifecycle-backfill.sql
--
-- One-time cleanup. Run AFTER migrate-alert-lifecycle.sql and BEFORE (or right
-- after) the new code starts serving.
--
-- WHY THIS IS NEEDED
-- The 326,745 pre-existing rows are all status='active' only because nothing
-- could ever close them: the Alertmanager resolve handler was a no-op for three
-- months (webhooks.service.ts logged resolves and discarded them). They are not
-- a live picture of what is broken:
--   * 324,835 of them are repeat insertions of ONE alert
--     (PodNotReady / kube-state-metrics), because repeat_interval is 4h and the
--     old create() always INSERTed.
--   * Most name CronJob pods that completed and disappeared months ago.
--
-- Left alone they are swept into the "Still failing (N)" digest that now rides
-- on every notification, producing a 326,745-line message and making the
-- feature useless on its very first send.
--
-- WHY UPDATE AND NOT DELETE
-- The history stays queryable, and anything genuinely still broken re-fires
-- within one scrape interval and re-opens as a fresh alert WITH a fingerprint.
-- resolvedAt is set to the row's last known firing rather than now(), so the
-- record does not claim these recovered at migration time.
--
-- SAFETY
-- Scoped to fingerprint IS NULL, i.e. legacy rows only. Any alert created by the
-- new code carries a fingerprint and is untouched by this statement, so it is
-- safe to re-run.

UPDATE monitoring.alerts
   SET status       = 'resolved',
       "resolvedAt" = COALESCE("lastFiredAt", "firedAt")
 WHERE status = 'active'
   AND "fingerprint" IS NULL;

-- Expected: UPDATE 326745 (or fewer, if run after new alerts have opened).
-- Verify with:
--   SELECT status, count(*) FROM monitoring.alerts GROUP BY status;
-- Expected after: active = only rows the NEW code opened (0 immediately after).

-- ---------------------------------------------------------------------------
-- Second pass, added 2026-08-27.
--
-- A node-wide I/O storm on 2026-08-26 18:19–18:41 opened 238 alerts while the
-- OLD code was still serving (the lifecycle deploy was mid-rollout, and the
-- rollout itself was what the storm blocked). That code never persisted a
-- fingerprint, so those rows are 'active' with fingerprint IS NULL.
--
-- HealthWatcher.expireStaleAlerts deliberately only expires alerts WITH a
-- fingerprint — those are the ones Alertmanager owns and would have re-fired,
-- so absence of a re-fire is meaningful. For a NULL-fingerprint row it is not:
-- nothing can ever re-fire or resolve it. They can only be closed here.
--
-- Same statement as the first pass, so re-running the whole file is safe and
-- idempotent: anything the new code opens carries a fingerprint and is skipped.
UPDATE monitoring.alerts
   SET status       = 'resolved',
       "resolvedAt" = COALESCE("lastFiredAt", "firedAt")
 WHERE status = 'active'
   AND "fingerprint" IS NULL;
