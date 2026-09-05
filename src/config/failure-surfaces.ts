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
 * Every one of these redirects both stdout and stderr into a log file and is
 * observed by nothing. A failure writes to disk and stops there: no exit code
 * is inspected, no alert is raised, and the file is only read if someone
 * already suspects a problem. This is the same shape as the trigger incident,
 * on the host instead of in the cluster.
 */
const CRONTAB_SURFACES: FailureSurface[] = [
  {
    surface: 'docker-prune-cron',
    kind: 'host-crontab',
    owningRepo: 'shared',
    failureDestination: 'nothing',
    autoFixEligible: false,
    notes: 'Weekly Sun 04:00. Prunes docker state under the deploy lock; a bad automated edit could delete live images.',
  },
  {
    surface: 'rotate-logging-admin-token',
    kind: 'host-crontab',
    owningRepo: 'shared',
    failureDestination: 'nothing',
    autoFixEligible: false,
    notes: 'Daily 03:15. Credential rotation — a silent failure here expires log ingest ecosystem-wide. Never auto-repaired.',
  },
  {
    surface: 'check-ingest-staleness',
    kind: 'host-crontab',
    owningRepo: 'logging-microservice',
    failureDestination: 'nothing',
    autoFixEligible: false,
    notes: 'Daily 03:45. This is itself a detector; if it dies silently the ecosystem loses a coverage check.',
  },
  {
    surface: 'backup-all-databases',
    kind: 'host-crontab',
    owningRepo: 'database-server',
    failureDestination: 'nothing',
    autoFixEligible: false,
    notes: 'Daily 02:00. Backups: a silently failing backup is only discovered during a restore. Highest-consequence gap on this list.',
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
    failureDestination: 'nothing',
    autoFixEligible: false,
    notes: 'Weekly. Root-owned script in /usr/local/sbin, outside any repo. Backup surface — never auto-repaired.',
  },
  {
    surface: 'statex-secret-census',
    kind: 'host-systemd-timer',
    owningRepo: 'shared',
    failureDestination: 'nothing',
    autoFixEligible: false,
    notes: 'Weekly. Audits secrets; a repair agent must not edit a component that reads every secret in the ecosystem.',
  },
  {
    surface: 'gnome-gui-recover',
    kind: 'host-systemd-timer',
    owningRepo: 'shared',
    failureDestination: 'nothing',
    autoFixEligible: true,
    notes: 'Every 3 min. Desktop session recovery; low blast radius.',
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
