import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LoggingService } from '../common/logging/logging.service';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const reporter = require('./vendor/credential-reporter.js');

const SELF_REPORT_CRON = process.env.CREDENTIAL_SELF_REPORT_CRON || '*/30 * * * *';

const AUTH_INTERNAL_URL =
  process.env.AUTH_INTERNAL_URL || 'http://auth-microservice.statex-apps.svc.cluster.local:3370';

const MONITORING_SELF_URL = process.env.MONITORING_SELF_URL || 'http://localhost:3395';

/**
 * This service's own principal, as auth lists it.
 *
 * Hardcoded rather than derived from the token, because the reporter must name
 * the principal the inventory knows even if the deployed token is wrong — which
 * is the case worth reporting. Deriving it from the token would make a broken
 * credential report under a broken name, or not at all.
 */
const PRINCIPAL = 'svc-monitoring-microservice--auth-microservice@internal.alfares.cz';

const TARGET = 'auth-microservice';

/**
 * Reports on THIS service's own credential, using the shared reporter.
 *
 * The first consumer adoption of `CREDENTIAL_SELF_REPORT_CONTRACT.md`, and the
 * pilot for the other repos. Monitoring is the right place to start for a
 * reason that is not convenience: it is the one service whose credential has a
 * genuine read-only probe target. `GET /internal/service-principals` on auth
 * enforces `internal:auth-microservice:readonly`, which is exactly the role this
 * credential holds, so a 200 proves the credential works and a 401/403 proves it
 * does not.
 *
 * That is rarer than the plan assumed. warehouse-microservice, checked while
 * choosing this pilot, holds `internal:warehouse-microservice:service` which
 * appears on exactly one orders route — a PUT. Its only unauthenticated
 * alternative, `/health`, returns 200 with no credential at all, so probing it
 * would report `accepted` for a service holding an empty token: the
 * catalog-contract-monitor failure exactly. Such a principal is `unprobeable`
 * and must stay `silent` rather than be given a probe that cannot fail.
 *
 * The watcher already sweeps and the reporter now reports, so this service's
 * credential appears in its own matrix by both routes.
 */
@Injectable()
export class CredentialSelfReporter {
  private readonly logger = new Logger(CredentialSelfReporter.name);

  constructor(private readonly logging: LoggingService) {}

  @Cron(SELF_REPORT_CRON)
  async scheduledReport(): Promise<void> {
    if (process.env.CREDENTIAL_SELF_REPORT_ENABLED === 'false') return;
    await this.runReport();
  }

  async runReport(): Promise<{ verdict: string; posted: boolean } | null> {
    const token = (process.env.AUTH_SERVICE_TOKEN || '').trim();
    const ingestToken = (process.env.NOTIFICATION_SERVICE_TOKEN || '').trim();

    if (!ingestToken) {
      // Without the ingest credential the verdict cannot be delivered. Log it
      // rather than silently skipping: a reporter that stops reporting is
      // indistinguishable from a credential that broke.
      this.logger.error('[CredentialSelfReporter] NOTIFICATION_SERVICE_TOKEN is empty — cannot post');
      await this.logging.log('error', 'credential_self_report_undeliverable', {
        principal: PRINCIPAL,
        reason: 'NOTIFICATION_SERVICE_TOKEN is empty',
      });
      return null;
    }

    const outcome = await reporter.reportCredential({
      // A read-only route that genuinely enforces this credential's role.
      url: `${AUTH_INTERNAL_URL}/internal/service-principals`,
      token,
      serviceName: 'monitoring-microservice',
      monitoringUrl: MONITORING_SELF_URL,
      ingestToken,
      principal: PRINCIPAL,
      target: TARGET,
    });

    await this.logging.log('info', 'credential_self_report_sent', {
      principal: PRINCIPAL,
      target: TARGET,
      verdict: outcome.verdict,
      posted: outcome.posted,
      error: outcome.error ?? null,
    });

    if (!outcome.posted) {
      this.logger.warn(
        `[CredentialSelfReporter] probe said ${outcome.verdict} but the report was not accepted` +
          (outcome.error ? `: ${outcome.error}` : ''),
      );
    }

    return { verdict: outcome.verdict, posted: outcome.posted };
  }
}
