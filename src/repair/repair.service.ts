import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AlertsService } from '../alerts/alerts.service';
import { HeartbeatService } from '../alerts/heartbeat.service';
import { NotificationsClient } from '../common/notifications/notifications.client';
import { RepairAttempt } from './repair-attempt.entity';
import { evaluateRepairGate, GateInput, MAX_ATTEMPTS_PER_FINGERPRINT } from './repair-gate';

/**
 * Phase 5b orchestrator: decides what autonomous repair should do about each
 * active alert, records the decision, and announces anything a human must pick
 * up.
 *
 * ROLLOUT POSTURE
 * ---------------
 * This ships with REPAIR_MODE=shadow. In shadow mode every alert is run through
 * the full gate and the verdict is persisted and logged, but no goal is opened
 * and nothing is changed. That is not timidity, it is sequencing: EP-TASK-006's
 * own exit criteria make "V3 fails closed on unobservable targets" a gate that
 * must be proven *before* autonomy is enabled, and the only honest way to prove
 * a decision engine is to watch it decide about real production alerts while it
 * cannot act on them. Shadow mode produces exactly that evidence at zero blast
 * radius, and flipping to REPAIR_MODE=active is a one-variable change once the
 * decisions have been reviewed.
 *
 * WHAT THIS SERVICE DELIBERATELY DOES NOT DO
 * ------------------------------------------
 * It does not write code, commit, deploy or revert. It cannot: the
 * monitoring-microservice pod has no volumes, no git binary, no SSH key and no
 * host filesystem, verified 2026-09-05. The execution half of the loop
 * therefore belongs to runlayer, which already owns agents and the serialized
 * deploy queue. Monitoring stays the detector, the gatekeeper, the verifier and
 * the announcer -- the authority on whether a fix worked, never the author of
 * the fix. Keeping the judge separate from the author is worth more here than
 * the convenience of one component doing both.
 */

const REPAIR_CRON = process.env.REPAIR_CRON || '*/10 * * * *';
const REPAIR_MODE = (process.env.REPAIR_MODE || 'shadow').toLowerCase();
const REPAIR_WATCHER_NAME = 'repair-orchestrator';
const REPAIR_INTERVAL_MINUTES = Number(process.env.REPAIR_INTERVAL_MINUTES || 10);

/** Cooldown applied to a surface after a repair fails verification. */
export const COOLDOWN_HOURS = Number(process.env.REPAIR_COOLDOWN_HOURS || 6);

@Injectable()
export class RepairService {
  private readonly logger = new Logger(RepairService.name);

  constructor(
    @InjectRepository(RepairAttempt) private readonly repo: Repository<RepairAttempt>,
    private readonly alerts: AlertsService,
    private readonly notifications: NotificationsClient,
    private readonly heartbeat: HeartbeatService,
  ) {
    this.heartbeat.register(REPAIR_WATCHER_NAME, REPAIR_INTERVAL_MINUTES);
  }

  @Cron(REPAIR_CRON)
  async scheduledSweep(): Promise<void> {
    try {
      await this.sweep();
    } catch (err) {
      this.logger.error(`[RepairService] sweep failed: ${(err as Error).message}`);
    }
  }

  async sweep(now: Date = new Date()): Promise<void> {
    const active = await this.alerts.findActive();
    for (const alert of active) {
      try {
        await this.considerAlert(alert, now);
      } catch (err) {
        // One undecidable alert must not stop the sweep; the rest still get
        // evaluated, and the failure is visible rather than swallowed.
        this.logger.error(
          `[RepairService] could not evaluate ${alert.alertname}/${alert.service}: ${(err as Error).message}`,
        );
      }
    }
    await this.heartbeat.beat(REPAIR_WATCHER_NAME);
  }

  private async considerAlert(alert: any, now: Date): Promise<void> {
    const fingerprint: string | null = alert.fingerprint ?? null;
    if (!fingerprint) return;

    // One decision per fingerprint. Without this a flapping detector would
    // announce an escalation on every sweep -- the noise failure that gets a
    // channel muted, which is how the original incident stayed unnoticed.
    const existing = await this.repo.find({
      where: { fingerprint },
      order: { startedAt: 'DESC' },
    });
    if (existing.length > 0 && !this.isRedecidable(existing[0], now)) return;

    const input: GateInput = {
      alertname: alert.alertname,
      service: alert.service ?? null,
      fingerprint,
      priorAttempts: existing.filter((a) => a.status !== 'shadow' && a.status !== 'blocked').length,
      ineligibleUntil: await this.cooldownUntil(alert.service ?? '', now),
    };

    const decision = evaluateRepairGate(input, now);

    if (!decision.allowed) {
      await this.recordBlocked(alert, fingerprint, decision.reason ?? 'no reason given', decision.surface, now);
      return;
    }

    if (REPAIR_MODE !== 'active') {
      await this.recordShadow(alert, fingerprint, decision.surface.surface, now);
      return;
    }

    // Active mode is intentionally not implemented in this commit. Reaching
    // here means the operator enabled REPAIR_MODE=active before the execution
    // half exists; say so loudly rather than silently doing nothing, because a
    // repair loop that quietly declines to repair is the exact defect this
    // project was created to eliminate.
    this.logger.error(
      `[RepairService] REPAIR_MODE=active but no execution backend is wired; ${fingerprint} not repaired`,
    );
    await this.recordShadow(alert, fingerprint, decision.surface.surface, now);
  }

  /**
   * A decision is revisited only if the situation genuinely changed: a cooldown
   * expired, or the previous attempt finished. A still-running attempt is left
   * alone.
   */
  private isRedecidable(last: RepairAttempt, now: Date): boolean {
    if (last.status === 'in_progress' || last.status === 'verifying') return false;
    if (last.status === 'blocked' || last.status === 'shadow') return false;
    if (last.status === 'abandoned') return false;
    if (last.status === 'failed' && last.finishedAt) {
      return now.getTime() - last.finishedAt.getTime() > COOLDOWN_HOURS * 3600_000;
    }
    return false;
  }

  /** Most recent failure for a surface, translated into a cooldown deadline. */
  private async cooldownUntil(surface: string, now: Date): Promise<Date | null> {
    if (!surface) return null;
    const lastFailure = await this.repo.findOne({
      where: { surface, status: 'failed' },
      order: { finishedAt: 'DESC' },
    });
    if (!lastFailure?.finishedAt) return null;
    const until = new Date(lastFailure.finishedAt.getTime() + COOLDOWN_HOURS * 3600_000);
    return until > now ? until : null;
  }

  private async recordBlocked(
    alert: any,
    fingerprint: string,
    reason: string,
    surface: { surface: string } | null,
    now: Date,
  ): Promise<void> {
    await this.repo.save(
      this.repo.create({
        fingerprint,
        alertname: alert.alertname,
        surface: surface?.surface ?? (alert.service ?? 'unknown'),
        service: alert.service ?? null,
        status: 'blocked',
        blockedReason: reason,
        startedAt: now,
        finishedAt: now,
      }),
    );
    this.logger.warn(`[RepairService] BLOCKED ${alert.alertname}/${alert.service}: ${reason}`);
    await this.announceBlocked(alert, reason);
  }

  private async recordShadow(
    alert: any,
    fingerprint: string,
    surface: string,
    now: Date,
  ): Promise<void> {
    await this.repo.save(
      this.repo.create({
        fingerprint,
        alertname: alert.alertname,
        surface,
        service: alert.service ?? null,
        status: 'shadow',
        blockedReason: null,
        startedAt: now,
        finishedAt: now,
      }),
    );
    this.logger.log(
      `[RepairService] SHADOW would repair ${surface} for ${alert.alertname} (fingerprint ${fingerprint})`,
    );
  }

  /**
   * A blocked repair is the one case that always needs a person, so it is the
   * one case that is announced. Eligible-and-shadowed decisions are not
   * announced: they are already covered by the underlying alert, and repeating
   * them would double the channel's volume for no added information.
   */
  private async announceBlocked(alert: any, reason: string): Promise<void> {
    const lines = [
      '🔒 Autonomous repair declined — human needed',
      '',
      `Alert: ${alert.alertname}`,
      `Service: ${alert.service ?? 'unknown'}`,
      `Severity: ${alert.severity ?? 'unknown'}`,
      '',
      `Why: ${reason}`,
      '',
      `Attempt budget is ${MAX_ATTEMPTS_PER_FINGERPRINT} per fingerprint.`,
    ];
    try {
      await this.notifications.sendTelegram(lines.join('\n'));
    } catch (err) {
      this.logger.error(`[RepairService] escalation not delivered: ${(err as Error).message}`);
    }
  }
}
