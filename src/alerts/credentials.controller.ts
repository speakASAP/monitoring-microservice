import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { MonitoringAdminGuard } from '../auth/monitoring-admin.guard';
import { MonitoringIngestGuard } from '../auth/monitoring-ingest.guard';
import { CredentialWatcher } from './credential-watcher';
import { CredentialReportDto } from './dto/credential-report.dto';

@Controller('api/credentials')
export class CredentialsController {
  constructor(private readonly watcher: CredentialWatcher) {}

  /**
   * Machine ingest: a consumer posts the verdict on its own credential.
   *
   * Gated by MonitoringIngestGuard, the same static-token gate the deploy queue
   * uses. A JWT-validating guard would be wrong here for the reason written up
   * in that guard: several legitimate machine callers hold static service
   * tokens, not RS256 JWTs, and would all be rejected.
   */
  @Post('report')
  @UseGuards(MonitoringIngestGuard)
  async report(@Body() dto: CredentialReportDto) {
    const stored = await this.watcher.recordSelfReport({
      principal: dto.principal,
      target: dto.target,
      verdict: dto.verdict,
      detail: dto.detail,
      status: dto.status,
      expiresAt: dto.expiresAt,
    });

    return { recorded: true, principal: stored.principal, receivedAt: stored.receivedAt };
  }

  /**
   * The current credential matrix: every principal auth knows about, reconciled
   * against what consumers have reported.
   *
   * Phase 1's whole output. `silent` is the row worth reading — a principal
   * nothing is checking is indistinguishable from a healthy one until it fails.
   */
  @Get()
  @UseGuards(MonitoringAdminGuard)
  async matrix() {
    const reconciled = await this.watcher.runCheck();

    return {
      count: reconciled.length,
      summary: {
        accepted: reconciled.filter((r) => r.status === 'accepted').length,
        rejected: reconciled.filter((r) => r.status === 'rejected').length,
        indeterminate: reconciled.filter((r) => r.status === 'indeterminate').length,
        silent: reconciled.filter((r) => r.status === 'silent').length,
        stale: reconciled.filter((r) => r.status === 'stale').length,
        // Orthogonal to the statuses above, not a sixth bucket: a credential can
        // be both rejected and expiring, and both facts matter.
        expiringSoon: reconciled.filter((r) => r.expiringSoon).length,
      },
      credentials: reconciled,
    };
  }
}
