-- Repair attempts: the durable state machine behind autonomous remediation.
--
-- EP-TASK-006 §"Open questions" flagged that monitoring.incidents exists with
-- no writer and no link to an alert, and warned against Phase 5 inventing a
-- second parallel incident model. This table is deliberately NOT that: it does
-- not describe an incident, it records one attempt to repair one alert
-- fingerprint, and it is keyed on that fingerprint so the alert store remains
-- the single source of truth about what is wrong.
--
-- It has to be durable because two of the safety rules are stateful: bounded
-- attempts per fingerprint, and the cooldown applied to a surface after a
-- failed repair. Held in memory, both would reset on every pod restart -- and
-- a repair loop that forgets its failures will retry them forever.

CREATE TABLE IF NOT EXISTS monitoring.repair_attempts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint     varchar(64)  NOT NULL,
  alertname       varchar(255) NOT NULL,
  surface         varchar(255) NOT NULL,
  service         varchar(255),
  -- shadow      : evaluated only; no action was taken (rollout mode)
  -- blocked     : the gate refused; a human was asked instead
  -- proposed    : eligible, goal not yet opened
  -- in_progress : goal open, fix being produced/deployed
  -- verifying   : fix applied, checks running
  -- verified    : all four checks passed
  -- failed      : verification failed; revert required or performed
  -- abandoned   : attempt budget exhausted, escalated
  status          varchar(32)  NOT NULL DEFAULT 'proposed',
  blocked_reason  text,
  goal_id         varchar(255),
  commit_sha      varchar(64),
  checks          jsonb,
  verification_summary text,
  started_at      timestamp NOT NULL DEFAULT now(),
  finished_at     timestamp,
  created_at      timestamp NOT NULL DEFAULT now(),
  updated_at      timestamp NOT NULL DEFAULT now()
);

-- The attempt-budget lookup ("how many times have we tried this fingerprint?")
-- runs on every sweep, so it gets an index rather than a sequential scan.
CREATE INDEX IF NOT EXISTS idx_repair_attempts_fingerprint
  ON monitoring.repair_attempts (fingerprint, started_at DESC);

-- Cooldown lookup: the most recent failure per surface.
CREATE INDEX IF NOT EXISTS idx_repair_attempts_surface_status
  ON monitoring.repair_attempts (surface, status, finished_at DESC);
