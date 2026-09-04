-- migrate-alert-flap-damping.sql
--
-- Flap damping and repeat backoff for the alert lifecycle. Additive only -- no
-- column dropped, no existing row rewritten beyond backfilling new defaults.
--
-- WHY THIS IS NEEDED (measured 2026-09-04 against the notifications DB, for
-- the window 2026-08-26 .. 2026-09-04):
--
--   Owner-chat telegram volume went from ~6 messages/day to
--   46/144/71/105/52/104. A single target, kube-state-metrics, produced 154 of
--   those messages: 60 ALERT + 44 RESOLVED + 50 STILL FAILING -- all of them
--   describing one continuous problem.
--
--   Two independent causes, both fixed here:
--
--   1. NO FLAP DAMPING. There were 26 resolved -> fired transitions, 22 of them
--      inside ten minutes (mean 429s). Each cycle sent a ✅ RESOLVED and then a
--      fresh 🚨 ALERT, so a service dipping in and out produced two messages per
--      cycle while its actual state -- broken -- never changed.
--
--      A resolve now marks the row resolved immediately (so findActive() and the
--      digest block are correct at once) but HOLDS the ✅ message for
--      ALERT_FLAP_WINDOW_MINUTES. A re-fire inside that window reopens the same
--      row silently: the original 🚨 was never retracted, so the channel is
--      already telling the truth and the quietest correct action is silence.
--
--   2. REPEAT ON EVERY TICK. HealthWatcher runs every 5 minutes and notified on
--      every one of them, which is exactly the 300s floor observed between the
--      72 STILL FAILING messages. A service down for a day sent 288 of them.
--      "lastNotifiedAt" now drives an escalating backoff (15m, 30m, 1h, 2h, 4h
--      capped), taking that same day to 8 messages.
--
-- Neither change can suppress an opening 🚨: backoff applies only to repeats of
-- a problem already announced, and damping only to a resolve that has an
-- unretracted 🚨 standing behind it.

ALTER TABLE monitoring.alerts
  ADD COLUMN IF NOT EXISTS "pendingResolveSince" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "flapCount"           INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastNotifiedAt"      TIMESTAMP;

-- Existing alerts have already had whatever notifications they were going to
-- get. Seeding "lastNotifiedAt" from the last known fire keeps the backoff from
-- treating every pre-migration alert as never-notified and restating all of
-- them at once on the first sweep after deploy.
UPDATE monitoring.alerts
   SET "lastNotifiedAt" = COALESCE("lastFiredAt", "firedAt")
 WHERE "lastNotifiedAt" IS NULL;

-- Rows already resolved before this migration must NOT be picked up by the
-- deferred-resolve sweeper and announced as fresh recoveries -- some of them
-- closed weeks ago. A NULL "pendingResolveSince" means "nothing owed", which is
-- the correct state for all of them, and is what the DEFAULT already gives.

-- Drives the sweeper that flushes due recoveries. Partial: the overwhelming
-- majority of rows are not awaiting an announcement.
CREATE INDEX IF NOT EXISTS idx_alerts_pending_resolve
  ON monitoring.alerts ("pendingResolveSince")
  WHERE "pendingResolveSince" IS NOT NULL;
