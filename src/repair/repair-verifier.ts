import { Injectable, Logger } from '@nestjs/common';
import { KubeClient } from '../k8s/kube-client';
import { LogReadClient } from '../common/logging/log-read.client';
import { FailureSurface } from '../config/failure-surfaces';

/**
 * Proves, against reality, that an autonomous fix actually worked.
 *
 * Under EP-TASK-006 D3 there is no pull request and no human approval, so this
 * is the only control standing between a machine-authored change and
 * production. It is written on the assumption that it is the last line, and
 * every check therefore fails closed: "I could not determine" is reported as
 * failure, never as success.
 *
 * The four checks are not interchangeable and none is sufficient alone:
 *
 *   V1  the new code is actually running   (a fix that never deployed is not a fix)
 *   V2  the service answers /health        (the owner's "check if service works")
 *   V3  the original signal cleared        (the owner's "errors should disappear")
 *   V4  nothing else broke                 (no reviewer exists to notice collateral damage)
 *
 * V2 without V3 is the trigger incident itself: catalog-microservice was
 * healthy for four days while the job that depended on it failed every thirty
 * minutes. V3 without V2 passes when a service is too dead to emit anything.
 */

/** Window over which "the errors stopped" must hold before it is believed. */
const VERIFY_WINDOW_MINUTES = Number(process.env.REPAIR_VERIFY_WINDOW_MINUTES || 15);

export type CheckName = 'V1_rollout' | 'V2_health' | 'V3_signal_cleared' | 'V4_no_collateral';

export interface CheckResult {
  check: CheckName;
  passed: boolean;
  detail: string;
}

export interface VerificationResult {
  verified: boolean;
  checks: CheckResult[];
  /** One-line summary suitable for a Telegram announcement. */
  summary: string;
}

export interface VerificationTarget {
  surface: FailureSurface;
  /** Service whose deployment and health are checked. */
  service: string;
  /** Alert fingerprint under repair. */
  fingerprint: string;
  /** When the repair was applied; V3 and V4 only consider evidence after this. */
  startedAt: Date;
}

/** Injected so the verifier owns no transport of its own. */
export interface VerifierDeps {
  /** Rollout state of the target deployment, or null if it cannot be read. */
  getRollout(namespace: string, name: string): Promise<{ ready: boolean; detail: string } | null>;
  /** True/false health, or null when the probe itself failed. */
  probeHealth(service: string): Promise<boolean | null>;
  /** Fingerprints active now that were not active at startedAt. */
  newFingerprintsSince(since: Date): Promise<string[] | null>;
}

@Injectable()
export class RepairVerifier {
  private readonly logger = new Logger(RepairVerifier.name);
  private readonly namespace = process.env.KUBE_NAMESPACE || 'statex-apps';

  constructor(
    private readonly kube: KubeClient,
    private readonly logs: LogReadClient,
  ) {}

  async verify(target: VerificationTarget, deps: VerifierDeps): Promise<VerificationResult> {
    const checks: CheckResult[] = [];
    checks.push(await this.checkRollout(target, deps));
    checks.push(await this.checkHealth(target, deps));
    checks.push(await this.checkSignalCleared(target));
    checks.push(await this.checkNoCollateral(target, deps));

    const failed = checks.filter((c) => !c.passed);
    const verified = failed.length === 0;
    const summary = verified
      ? `all 4 checks passed for ${target.surface.surface}`
      : `${failed.length}/4 checks failed: ${failed.map((f) => `${f.check} (${f.detail})`).join('; ')}`;

    return { verified, checks, summary };
  }

  /** V1 — the fix is running, not merely committed. */
  private async checkRollout(t: VerificationTarget, deps: VerifierDeps): Promise<CheckResult> {
    const rollout = await deps.getRollout(this.namespace, t.service);
    if (rollout === null) {
      return {
        check: 'V1_rollout',
        passed: false,
        detail: 'rollout state unreadable — cannot confirm the fix is running',
      };
    }
    return { check: 'V1_rollout', passed: rollout.ready, detail: rollout.detail };
  }

  /** V2 — the owner's "check if service works". */
  private async checkHealth(t: VerificationTarget, deps: VerifierDeps): Promise<CheckResult> {
    const healthy = await deps.probeHealth(t.service);
    if (healthy === null) {
      return {
        check: 'V2_health',
        passed: false,
        detail: 'health probe did not answer — unreachable is not healthy',
      };
    }
    return {
      check: 'V2_health',
      passed: healthy,
      detail: healthy ? 'service reports healthy' : 'service reports unhealthy',
    };
  }

  /**
   * V3 — the original signal actually cleared. The owner's stated test:
   * "check the logs after service fix; errors should disappear."
   *
   * This is the check that fails closed hardest, because the way it fails
   * silently is so attractive. Eight services currently ship no logs at all.
   * If "no errors observed" counted as success, every fix to any of those eight
   * would verify perfectly, forever, on the strength of the fact that nobody
   * can see them -- manufacturing exactly the false confidence this project
   * exists to remove. So an unobservable target is a FAILED verification, and
   * the operator is told the difference between "fixed" and "cannot tell".
   */
  private async checkSignalCleared(t: VerificationTarget): Promise<CheckResult> {
    if (t.surface.kind === 'k8s-cronjob') {
      return this.checkCronJobSucceeded(t);
    }
    return this.checkErrorsStopped(t);
  }

  /**
   * For a scheduled job, the only honest proof is a real run completing after
   * the fix landed. A green deploy proves nothing about a job that runs on its
   * own schedule -- which is precisely how the trigger incident stayed hidden.
   */
  private async checkCronJobSucceeded(t: VerificationTarget): Promise<CheckResult> {
    let jobs;
    try {
      jobs = await this.kube.listCronJobs(this.namespace);
    } catch (err) {
      return {
        check: 'V3_signal_cleared',
        passed: false,
        detail: `cannot read CronJob state (${(err as Error).message}) — unverifiable`,
      };
    }
    const cj = jobs.find((j) => j.name === t.surface.surface);
    if (!cj) {
      return {
        check: 'V3_signal_cleared',
        passed: false,
        detail: `CronJob ${t.surface.surface} not found in ${this.namespace}`,
      };
    }
    const last = cj.lastSuccessfulTime ? new Date(cj.lastSuccessfulTime) : null;
    if (!last || last <= t.startedAt) {
      // Not yet a failure of the fix -- a failure to have observed a run yet.
      // The caller keeps the attempt open until the verification deadline.
      return {
        check: 'V3_signal_cleared',
        passed: false,
        detail: last
          ? `no successful run since the fix (last success ${last.toISOString()}, fix ${t.startedAt.toISOString()})`
          : 'CronJob has never recorded a successful run',
      };
    }
    return {
      check: 'V3_signal_cleared',
      passed: true,
      detail: `succeeded at ${last.toISOString()}, after the fix`,
    };
  }

  /**
   * For a long-running service, the signal is its error stream. Reading that
   * requires the service to have a working error stream in the first place,
   * which is checked first and explicitly.
   */
  private async checkErrorsStopped(t: VerificationTarget): Promise<CheckResult> {
    const coverage = await this.logs.fetchCoverage();
    if (coverage === null) {
      return {
        check: 'V3_signal_cleared',
        passed: false,
        detail: 'log coverage unreadable — cannot confirm the service is observable',
      };
    }
    const stale = coverage.stale.find((e) => e.service === t.service);
    if (stale) {
      return {
        check: 'V3_signal_cleared',
        passed: false,
        detail: `${t.service} has shipped no logs for ${Math.round(stale.age_hours)}h — silence is not proof of repair`,
      };
    }
    const shipping = coverage.shipping.some((e) => e.service === t.service);
    if (!shipping) {
      return {
        check: 'V3_signal_cleared',
        passed: false,
        detail: `${t.service} is not shipping logs — the fix cannot be verified by observation`,
      };
    }

    // Ask for the same window the watcher uses, so "errors stopped" is judged
    // over the same span that would have raised the alert in the first place.
    const summary = await this.logs.fetchErrorSummary(VERIFY_WINDOW_MINUTES);
    if (summary === null) {
      return {
        check: 'V3_signal_cleared',
        passed: false,
        detail: 'error summary unreadable — cannot confirm errors stopped',
      };
    }
    // The index must have been observing for the whole window, or "no errors"
    // just means "restarted recently" -- the same silence-as-health bug.
    const observedMinutes = Math.floor(
      (Date.now() - new Date(summary.indexedSince).getTime()) / 60000,
    );
    if (observedMinutes < summary.windowMinutes) {
      return {
        check: 'V3_signal_cleared',
        passed: false,
        detail: `error index only ${observedMinutes}m old, needs ${summary.windowMinutes}m of observation`,
      };
    }
    const offending = summary.groups.filter((g) => g.service === t.service);
    if (offending.length > 0) {
      const worst = offending.sort((a, b) => b.count - a.count)[0];
      return {
        check: 'V3_signal_cleared',
        passed: false,
        detail: `${t.service} still logging errors: ${worst.count}x ${worst.signature.slice(0, 80)}`,
      };
    }
    return {
      check: 'V3_signal_cleared',
      passed: true,
      detail: `${t.service} is shipping logs and reported no errors over ${summary.windowMinutes}m`,
    };
  }

  /**
   * V4 — nothing else broke.
   *
   * An autonomous change has no reviewer, so a fix that repairs S and breaks T
   * would otherwise be indistinguishable from a clean success. The alert store
   * is the blast-radius oracle.
   */
  private async checkNoCollateral(t: VerificationTarget, deps: VerifierDeps): Promise<CheckResult> {
    const fresh = await deps.newFingerprintsSince(t.startedAt);
    if (fresh === null) {
      return {
        check: 'V4_no_collateral',
        passed: false,
        detail: 'alert store unreadable — cannot rule out collateral damage',
      };
    }
    const collateral = fresh.filter((f) => f !== t.fingerprint);
    return {
      check: 'V4_no_collateral',
      passed: collateral.length === 0,
      detail: collateral.length === 0
        ? 'no new alerts during verification'
        : `new alerts appeared: ${collateral.join(', ')}`,
    };
  }
}
