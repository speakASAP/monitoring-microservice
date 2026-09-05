/**
 * Every place in the ecosystem that can fail, and where its failure is supposed
 * to go.
 *
 * The trigger for this file: catalog-contract-monitor failed every 30 minutes
 * for four days and produced zero alerts. Nothing was broken in the alerting
 * engine -- over the same window it delivered five correct alerts from other
 * sources. The problem was that nobody had ever written down that CronJob
 * outcomes were a thing that needed watching, so their absence looked exactly
 * like silence.
 *
 * That is the failure mode this file exists to make impossible. A blind spot
 * you have not declared is invisible; a blind spot you HAVE declared is a
 * failing check. `failureDestination: 'nothing'` is therefore a legal value and
 * an important one -- it is how a known gap stays visible instead of being
 * quietly forgotten.
 *
 * This is a declaration of intent, not a discovery. `scripts/check-failure-
 * surface-coverage.ts` compares it against the live cluster and host, and a
 * surface that exists in reality but not here is reported as undeclared. The
 * comparison is the point: a hand-maintained list that nothing checks would
 * drift into fiction within weeks, which is the same class of defect as the
 * ECOSYSTEM_MAP entry still advertising a Grafana that was retired in August.
 */

/** How a surface's failures are detected today. Not aspirationally. */
export type FailureDestination =
  /** A watcher in this service turns the failure into an alert. */
  | 'monitoring-alert'
  /** The surface posts its own errors to logging-microservice. */
  | 'logging-error-log'
  /** Nothing observes this. A declared, visible gap. */
  | 'nothing';

export type FailureSurfaceKind =
  | 'k8s-cronjob'
  | 'host-crontab'
  | 'host-systemd-timer'
  | 'k8s-deployment';

export interface FailureSurface {
  /** Stable identifier, unique across kinds. */
  surface: string;
  kind: FailureSurfaceKind;
  /** Repository that owns a fix. '-' where no single repo owns it. */
  owningRepo: string;
  failureDestination: FailureDestination;
  /**
   * Whether automated repair may touch this surface.
   *
   * False on anything where a wrong autonomous fix is worse than a delay:
   * credentials, auth, backups, and the monitoring stack itself. The reasoning
   * is in the notes on each entry. This flag is the containment boundary for
   * automated remediation -- it is consulted before any repair is attempted,
   * and it is deliberately conservative.
   */
  autoFixEligible: boolean;
  /** Why this entry reads the way it does, where that is not obvious. */
  notes?: string;
}

/**
 * Kubernetes CronJobs, as measured in statex-apps on 2026-09-05.
 *
 * All 11 are now covered by JobWatcher. Before it existed every one of them was
 * `nothing` -- 11 surfaces, none observed, which is how the trigger incident
 * ran for four days unnoticed.
 */
const CRONJOB_SURFACES: FailureSurface[] = [
  {
    surface: 'catalog-contract-monitor',
    kind: 'k8s-cronjob',
    owningRepo: 'catalog-microservice',
    failureDestination: 'monitoring-alert',
    // The job asserts a contract by authenticating as a caller. Repairing it
    // means changing what identity it claims, which is a security-surface
    // change: a plausible wrong fix (granting the name it asks for) would
    // silence the alarm by widening access. Humans only.
    autoFixEligible: false,
    notes: 'Trigger incident. Broken since 2026-09-01 by catalog auth hardening; both credential paths fail.',
  },
  { surface: 'cliplot-readiness-monitor', kind: 'k8s-cronjob', owningRepo: 'cliplot', failureDestination: 'monitoring-alert', autoFixEligible: true },
  { surface: 'domain-research-expiry-recheck', kind: 'k8s-cronjob', owningRepo: 'domain-research', failureDestination: 'monitoring-alert', autoFixEligible: true },
  { surface: 'domain-research-notification-dispatch', kind: 'k8s-cronjob', owningRepo: 'domain-research', failureDestination: 'monitoring-alert', autoFixEligible: true },
  { surface: 'marketing-order-affinity-allegro-daily', kind: 'k8s-cronjob', owningRepo: 'marketing-microservice', failureDestination: 'monitoring-alert', autoFixEligible: true },
  { surface: 'marketing-order-affinity-aukro-daily', kind: 'k8s-cronjob', owningRepo: 'marketing-microservice', failureDestination: 'monitoring-alert', autoFixEligible: true },
  { surface: 'marketing-order-affinity-bazos-daily', kind: 'k8s-cronjob', owningRepo: 'marketing-microservice', failureDestination: 'monitoring-alert', autoFixEligible: true },
  { surface: 'marketing-order-affinity-central-orders-backfill', kind: 'k8s-cronjob', owningRepo: 'marketing-microservice', failureDestination: 'monitoring-alert', autoFixEligible: true },
  {
    surface: 'pod-janitor',
    kind: 'k8s-cronjob',
    owningRepo: 'shared',
    failureDestination: 'monitoring-alert',
    // Holds pods/delete cluster-wide. Automated edits to a component that
    // deletes pods is not a risk worth taking for a job that has never failed.
    autoFixEligible: false,
    notes: 'Reclaims failed pods after 120 min — which is also what destroys job evidence.',
  },
  { surface: 'speakasap-lesson-record-sync', kind: 'k8s-cronjob', owningRepo: 'speakasap', failureDestination: 'monitoring-alert', autoFixEligible: true },
  { surface: 'warehouse-reservation-expiry', kind: 'k8s-cronjob', owningRepo: 'warehouse-microservice', failureDestination: 'monitoring-alert', autoFixEligible: true },
];

/**
 * Root crontab entries, measured 2026-09-05.
 *
 * Until 2026-09-05 every one of these redirected stdout and stderr into a log
 * file and was observed by nothing: a failure wrote to disk and stopped there,
 * no exit code inspected, no alert raised, the file read only by someone who
 * already suspected a problem. The same shape as the trigger incident, on the
 * host instead of in the cluster.
 *
 * All four are now wrapped by shared/scripts/run-and-report.sh, which preserves
 * the append-to-logfile behaviour and the job's exit code and adds an alert on
 * failure plus a resolve on the next success.
 */
const CRONTAB_SURFACES: FailureSurface[] = [
  {
    surface: 'docker-prune-cron',
    kind: 'host-crontab',
    owningRepo: 'shared',
    failureDestination: 'monitoring-alert',
    autoFixEligible: false,
    notes: 'Weekly Sun 04:00. Wrapped by run-and-report.sh. Prunes docker state under the deploy lock; a bad automated edit could delete live images.',
  },
  {
    surface: 'rotate-logging-admin-token',
    kind: 'host-crontab',
    owningRepo: 'shared',
    failureDestination: 'monitoring-alert',
    autoFixEligible: false,
    notes: 'Daily 03:15. Wrapped by run-and-report.sh. Credential rotation — a silent failure here expires log ingest ecosystem-wide. Never auto-repaired.',
  },
  {
    surface: 'check-ingest-staleness',
    kind: 'host-crontab',
    owningRepo: 'logging-microservice',
    failureDestination: 'monitoring-alert',
    autoFixEligible: false,
    notes: 'Daily 03:45. Wrapped by run-and-report.sh. This is itself a detector; if it dies silently the ecosystem loses a coverage check.',
  },
  {
    surface: 'backup-all-databases',
    kind: 'host-crontab',
    owningRepo: 'database-server',
    failureDestination: 'monitoring-alert',
    autoFixEligible: false,
    notes: 'Daily 02:00. Wrapped by run-and-report.sh — this was the highest-consequence gap, since a silently failing backup is only discovered during a restore.',
  },
  {
    surface: 'poll-systemd-timers',
    kind: 'host-crontab',
    owningRepo: 'shared',
    failureDestination: 'monitoring-alert',
    autoFixEligible: false,
    notes:
      'Every 5 min. Watches the three host systemd timers. Declared rather than filtered out as a wrapper, because ' +
      'a watcher that stops is a gap that looks exactly like health: the surfaces it covers simply go quiet. ' +
      'Wrapped by run-and-report.sh so a crash or non-zero exit alerts. Residual gap: if this crontab line is ' +
      'removed outright, nothing notices — closing that needs a heartbeat with a staleness check, tracked for Phase 5b. ' +
      'Not auto-repairable: an agent editing its own failure detector is how a blind spot becomes permanent.',
  },
];

/**
 * Ecosystem-owned systemd timers, measured 2026-09-05.
 *
 * Measured fact: no unit under /etc/systemd/system declares OnFailure=. systemd
 * records the failure in unit state and nothing forwards it anywhere, so these
 * are unobserved for the same reason the crontab entries are.
 *
 * OS-managed timers (apt, man-db, logrotate, sysstat, mdcheck) are deliberately
 * excluded: they are not ours to fix and alerting on them would add noise
 * without adding agency.
 */
const SYSTEMD_TIMER_SURFACES: FailureSurface[] = [
  {
    surface: 'alfares-critical-backup',
    kind: 'host-systemd-timer',
    owningRepo: '-',
    failureDestination: 'monitoring-alert',
    autoFixEligible: false,
    notes:
      'Daily 02:17. Root-owned script in /usr/local/sbin, outside any repo. Backup surface — never auto-repaired. ' +
      'Watched by shared/scripts/poll-systemd-timers.sh from the ssf crontab, not by an OnFailure= drop-in: the unit ' +
      'is root-owned and sudo is password-gated here, so polling is what could actually be installed.',
  },
  {
    surface: 'statex-secret-census',
    kind: 'host-systemd-timer',
    owningRepo: 'shared',
    failureDestination: 'monitoring-alert',
    autoFixEligible: false,
    notes:
      'Daily 09:30. Audits secrets; a repair agent must not edit a component that reads every secret in the ecosystem. ' +
      'Watched by shared/scripts/poll-systemd-timers.sh.',
  },
  {
    surface: 'gnome-gui-recover',
    kind: 'host-systemd-timer',
    owningRepo: 'shared',
    failureDestination: 'monitoring-alert',
    autoFixEligible: true,
    notes:
      'Every 3 min. Desktop session recovery; low blast radius. Watched by shared/scripts/poll-systemd-timers.sh.',
  },
];

export const FAILURE_SURFACES: FailureSurface[] = [
  ...CRONJOB_SURFACES,
  ...CRONTAB_SURFACES,
  ...SYSTEMD_TIMER_SURFACES,
];

/** Surfaces whose failures currently reach nobody. */
export function undetectedSurfaces(surfaces: FailureSurface[] = FAILURE_SURFACES): FailureSurface[] {
  return surfaces.filter((s) => s.failureDestination === 'nothing');
}

/** Look up a surface by name. */
export function findSurface(
  name: string,
  surfaces: FailureSurface[] = FAILURE_SURFACES,
): FailureSurface | undefined {
  return surfaces.find((s) => s.surface === name);
}

/**
 * Whether automated repair may touch a surface.
 *
 * Fails CLOSED on anything not in the ledger. An unknown surface is one nobody
 * has assessed the blast radius of, and the safe reading of "unassessed" is
 * "not eligible" -- otherwise adding a surface would silently opt it into
 * automated repair.
 */
export function isAutoFixEligible(
  name: string,
  surfaces: FailureSurface[] = FAILURE_SURFACES,
): boolean {
  return findSurface(name, surfaces)?.autoFixEligible === true;
}
