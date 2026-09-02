import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import axios from 'axios';
import { LoggingService } from '../common/logging/logging.service';

const CREDENTIAL_WATCH_CRON = process.env.CREDENTIAL_WATCH_CRON || '*/30 * * * *';

const AUTH_INTERNAL_URL =
  process.env.AUTH_INTERNAL_URL || 'http://auth-microservice.statex-apps.svc.cluster.local:3370';

const INVENTORY_TIMEOUT_MS = Number(process.env.CREDENTIAL_INVENTORY_TIMEOUT_MS || 5000);

/**
 * How long a self-report stays meaningful.
 *
 * Consumers are expected to report every 30 minutes, so this allows several
 * missed cycles before a principal is called silent — long enough that one
 * restart or slow cycle is not a finding, short enough that a credential broken
 * this morning is not still counted as fresh tonight.
 */
const REPORT_TTL_MINUTES = Number(process.env.CREDENTIAL_REPORT_TTL_MINUTES || 120);

export type ProbeVerdict = 'accepted' | 'rejected' | 'indeterminate';

export type ReconciledStatus = ProbeVerdict | 'silent' | 'stale';

/**
 * A verdict posted by a consumer about its own credential.
 *
 * The consumer probes with the token it actually holds, so the verdict reflects
 * the deployed credential rather than a reconstruction of it. No secret is sent
 * — only the outcome.
 */
export interface CredentialSelfReport {
  /** The principal the reporter authenticated as. */
  principal: string;
  /** The service that accepted or rejected it. */
  target: string;
  verdict: ProbeVerdict;
  detail?: string;
  status?: number;
  receivedAt: Date;
}

export interface PrincipalGrant {
  application: string | null;
  roleName: string;
  roleScope: string;
  expiresAt: string | null;
}

export interface PrincipalRecord {
  id: string;
  email: string;
  isActive: boolean;
  conventionTarget: string | null;
  onConvention: boolean;
  grants: PrincipalGrant[];
  targetMismatch: boolean;
}

export interface ReconciledCredential {
  principal: string;
  status: ReconciledStatus;
  detail: string;
  target?: string | null;
  reportedAt?: Date;
}

/**
 * Reconciles the service-principal inventory held by auth against the verdicts
 * consumers report about their own credentials.
 *
 * Consumers probe themselves rather than being probed: each one holds exactly
 * one credential and can present it to its own receiver, so a verdict here
 * describes the credential that is actually deployed. The alternative — one
 * prober holding every service's token — would make this service able to
 * impersonate the entire ecosystem to check on it.
 *
 * That inversion makes SILENCE the primary signal. A credential that stops
 * working usually stops reporting, and the three incidents behind this work all
 * looked healthy from the outside. So a principal that exists in auth and has
 * not reported is a finding in its own right, not an absence of data.
 *
 * Phase 1 reports only. It fires no alerts and clears none, by design — the
 * real rate of silence and rejection is unknown, and wiring alerts before
 * knowing it is how a channel gets muted on its first day.
 */
@Injectable()
export class CredentialWatcher {
  private readonly logger = new Logger(CredentialWatcher.name);

  /** Latest verdict per principal. In-memory: Phase 1 is observational. */
  private readonly reports = new Map<string, CredentialSelfReport>();

  constructor(private readonly logging: LoggingService) {}

  /**
   * Record one consumer's verdict about its own credential.
   *
   * Last write wins per principal — this is a current-state view, not an audit
   * log; the structured log carries the history.
   */
  async recordSelfReport(
    report: Omit<CredentialSelfReport, 'receivedAt'>,
  ): Promise<CredentialSelfReport> {
    const stored: CredentialSelfReport = { ...report, receivedAt: new Date() };
    this.reports.set(report.principal, stored);

    await this.logging.log('info', 'credential_self_report', {
      principal: report.principal,
      target: report.target,
      verdict: report.verdict,
      status: report.status ?? null,
      detail: report.detail ?? null,
    });

    return stored;
  }

  getReports(): CredentialSelfReport[] {
    return Array.from(this.reports.values());
  }

  @Cron(CREDENTIAL_WATCH_CRON)
  async scheduledCheck(): Promise<void> {
    if (process.env.CREDENTIAL_WATCH_ENABLED === 'false') return;
    await this.runCheck();
  }

  async runCheck(): Promise<ReconciledCredential[]> {
    let principals: PrincipalRecord[];
    try {
      principals = await this.fetchInventory();
    } catch (err: any) {
      // This service's own credential failing is the very failure being watched
      // for, so it is reported loudly rather than returning an empty sweep that
      // would read as "nothing to check".
      this.logger.error(`[CredentialWatcher] inventory fetch failed: ${err?.message ?? String(err)}`);
      await this.logging.log('error', 'credential_watch_inventory_failed', {
        error: err?.message ?? String(err),
        authUrl: AUTH_INTERNAL_URL,
      });
      return [];
    }

    const reconciled = principals.map((p) => this.reconcile(p));
    await this.logSummary(reconciled, principals);
    return reconciled;
  }

  /**
   * Reads the inventory using this service's OWN per-pair principal
   * (`svc-monitoring-microservice--auth-microservice`, RS256).
   *
   * Deliberately not the shared `INTERNAL_SERVICE_TOKEN` static string. That
   * credential carries no identity, so it can neither be enumerated nor
   * attributed on rejection — the watcher would be observing the fleet with the
   * one credential shape it cannot observe. With a real principal, this
   * watcher's own credential appears in its own matrix and is probed like any
   * other. See the plan's Task E.
   */
  private async fetchInventory(): Promise<PrincipalRecord[]> {
    const token = process.env.AUTH_SERVICE_TOKEN || '';
    if (!token) {
      throw new Error('AUTH_SERVICE_TOKEN is empty — cannot read the principal inventory');
    }

    const res = await axios.get(`${AUTH_INTERNAL_URL}/internal/service-principals`, {
      timeout: INVENTORY_TIMEOUT_MS,
      headers: {
        Authorization: `Bearer ${token}`,
        'x-service-name': 'monitoring-microservice',
      },
    });

    return res.data?.principals ?? [];
  }

  private reconcile(principal: PrincipalRecord): ReconciledCredential {
    const report = this.reports.get(principal.email);

    if (!report) {
      return {
        principal: principal.email,
        status: 'silent',
        detail:
          'principal exists in auth but has never reported — nothing is checking this credential',
      };
    }

    const ageMinutes = (Date.now() - report.receivedAt.getTime()) / 60000;
    if (ageMinutes > REPORT_TTL_MINUTES) {
      return {
        principal: principal.email,
        status: 'stale',
        detail: `last report was ${Math.round(ageMinutes)}m ago, past the ${REPORT_TTL_MINUTES}m TTL`,
        target: report.target,
        reportedAt: report.receivedAt,
      };
    }

    return {
      principal: principal.email,
      status: report.verdict,
      detail: report.detail ?? `reporter said ${report.verdict}`,
      target: report.target,
      reportedAt: report.receivedAt,
    };
  }

  private async logSummary(
    reconciled: ReconciledCredential[],
    principals: PrincipalRecord[],
  ): Promise<void> {
    const tally = (s: ReconciledStatus) => reconciled.filter((r) => r.status === s).length;

    const summary = {
      total: reconciled.length,
      accepted: tally('accepted'),
      rejected: tally('rejected'),
      indeterminate: tally('indeterminate'),
      silent: tally('silent'),
      stale: tally('stale'),
    };

    // Verdicts posted for principals auth does not list: a reporter using a
    // credential the inventory has no record of. Worth surfacing rather than
    // dropping, since it means the two views disagree about what exists.
    const known = new Set(principals.map((p) => p.email));
    const unknownReporters = this.getReports()
      .map((r) => r.principal)
      .filter((p) => !known.has(p));

    this.logger.log(
      `[CredentialWatcher] ${summary.total} principal(s): ${summary.accepted} accepted, ` +
        `${summary.rejected} rejected, ${summary.indeterminate} indeterminate, ` +
        `${summary.silent} silent, ${summary.stale} stale`,
    );

    await this.logging.log('info', 'credential_watch_sweep', {
      ...summary,
      rejectedPrincipals: reconciled.filter((r) => r.status === 'rejected').map((r) => r.principal),
      silentPrincipals: reconciled.filter((r) => r.status === 'silent').map((r) => r.principal),
      stalePrincipals: reconciled.filter((r) => r.status === 'stale').map((r) => r.principal),
      unknownReporters,
      offConvention: principals.filter((p) => !p.onConvention).length,
      targetMismatch: principals.filter((p) => p.targetMismatch).length,
    });
  }
}
