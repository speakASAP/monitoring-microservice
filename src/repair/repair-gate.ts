import { FailureSurface, findSurface, isAutoFixEligible } from '../config/failure-surfaces';

/**
 * Decides whether automated repair may act on an alert, and says why not when
 * it may not.
 *
 * This is the containment boundary named in EP-TASK-006 R3. It exists because
 * the incident that started this work -- catalog-contract-monitor returning 401
 * after an auth hardening -- is the worked example of a fix an outcome gate
 * cannot catch: reverting the hardening would make the job pass every
 * verification while undoing a deliberate security change. No amount of
 * "did it work?" testing distinguishes that from a correct fix. Only refusing
 * to touch the surface does.
 *
 * The gate is therefore consulted before anything else, and every rule fails
 * closed: an unknown surface, an unmapped service, or a missing ledger entry
 * all yield "not eligible". Autonomy is opt-in per surface, never inferred.
 */

/**
 * Flat rather than a discriminated union on purpose: this project builds with
 * `strictNullChecks: false`, under which TypeScript will not narrow a union by
 * a boolean discriminant, so a union would compile to unchecked property
 * access at exactly the call sites that decide whether to touch production.
 */
export interface RepairDecision {
  allowed: boolean;
  /** Populated whenever `allowed` is false. Written into the announcement. */
  reason: string | null;
  surface: FailureSurface | null;
}

/** Alert shape the gate needs. Deliberately minimal so tests need no fixtures. */
export interface GateInput {
  alertname: string;
  service: string | null;
  fingerprint: string | null;
  /** Attempts already made for this fingerprint, successful or not. */
  priorAttempts: number;
  /** Set while a surface is serving a cooldown after a failed repair. */
  ineligibleUntil?: Date | null;
}

/**
 * Alert names that describe the monitoring stack observing itself.
 *
 * A repair loop that edits its own detector can silence the signal that would
 * report the edit was wrong -- the failure mode of this entire project, one
 * level up. These are always escalated to a human, never repaired.
 */
export const SELF_REFERENTIAL_ALERTS = new Set([
  'WatcherHeartbeatMissing',
  'LogIngestStale',
  'AlertDeliveryFailure',
]);

/**
 * Bounded attempts per fingerprint (EP-TASK-006 R7: revert, don't retry).
 *
 * A loop that retries a failing fix consumes the deploy queue, whose behaviour
 * under machine-generated commits has never been measured. Two attempts is
 * enough for a transient deploy failure and not enough to build a queue.
 */
export const MAX_ATTEMPTS_PER_FINGERPRINT = 2;

export function evaluateRepairGate(input: GateInput, now: Date = new Date()): RepairDecision {
  if (SELF_REFERENTIAL_ALERTS.has(input.alertname)) {
    return {
      allowed: false,
      surface: null,
      reason: `${input.alertname} reports the monitoring stack itself; a self-repair could disable the detector that would catch a bad fix`,
    };
  }

  if (!input.fingerprint) {
    // Without a fingerprint there is no dedup key, so a flapping detector would
    // open a goal per cycle.
    return { allowed: false, surface: null, reason: 'alert has no fingerprint to deduplicate on' };
  }

  const surface = findSurface(input.service ?? '');
  if (!surface) {
    return {
      allowed: false,
      surface: null,
      reason: `no ledger entry for '${input.service ?? 'unknown'}' — an unregistered surface is never auto-repaired`,
    };
  }

  if (!isAutoFixEligible(surface.surface)) {
    return {
      allowed: false,
      surface,
      reason: `ledger marks ${surface.surface} auto_fix_eligible=false${surface.notes ? `: ${surface.notes}` : ''}`,
    };
  }

  if (input.ineligibleUntil && input.ineligibleUntil > now) {
    return {
      allowed: false,
      surface,
      reason: `${surface.surface} is in cooldown after a failed repair until ${input.ineligibleUntil.toISOString()}`,
    };
  }

  if (input.priorAttempts >= MAX_ATTEMPTS_PER_FINGERPRINT) {
    return {
      allowed: false,
      surface,
      reason: `already attempted ${input.priorAttempts} repair(s) for this fingerprint; escalating instead of retrying`,
    };
  }

  return { allowed: true, reason: null, surface };
}
