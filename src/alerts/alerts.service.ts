import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alert } from './alerts.entity';
import { CreateAlertDto } from './dto/create-alert.dto';
import { AcknowledgeAlertDto } from './dto/acknowledge-alert.dto';

/** What actually happened to the alert state — decides whether to notify. */
export type AlertTransition = 'fired' | 'repeat' | 'resolved' | 'noop';

export interface FireResult {
  transition: Extract<AlertTransition, 'fired' | 'repeat'>;
  alert: Alert;
}

export interface ResolveResult {
  transition: Extract<AlertTransition, 'resolved' | 'noop'>;
  alert: Alert | null;
}

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(@InjectRepository(Alert) private repo: Repository<Alert>) {}

  findActive(): Promise<Alert[]> {
    return this.repo.find({ where: { status: 'active' }, order: { firedAt: 'DESC' } });
  }

  findAll(): Promise<Alert[]> {
    return this.repo.find({ order: { firedAt: 'DESC' }, take: 200 });
  }

  /**
   * Record an alert firing, and say whether this OPENED the problem or is the
   * same problem still going.
   *
   * Identity is the fingerprint (Alertmanager's hash of the label set). One
   * active row per fingerprint, enforced in the DB by the partial unique index
   * uq_alerts_active_fingerprint — an upsert here plus a constraint there, so a
   * concurrent double-fire cannot produce two open rows for one problem.
   *
   * Before this existed, every re-fire INSERTed: Alertmanager's 4h
   * repeat_interval turned one stuck pod into 324,835 rows.
   */
  async fire(dto: CreateAlertDto & { fingerprint?: string | null }): Promise<FireResult> {
    const fingerprint = dto.fingerprint ?? null;
    const now = new Date();

    const existing = fingerprint
      ? await this.repo.findOne({ where: { fingerprint, status: 'active' } })
      : null;

    if (existing) {
      existing.occurrenceCount = (existing.occurrenceCount ?? 1) + 1;
      existing.lastFiredAt = now;
      // Refresh the human-facing fields: the underlying condition may have
      // changed detail (a different pod, a worse severity) while staying the
      // same alert.
      existing.message = dto.message;
      existing.severity = dto.severity;
      if (dto.labels !== undefined) existing.labels = dto.labels;

      const saved = await this.repo.save(existing);
      return { transition: 'repeat', alert: saved };
    }

    const alert = this.repo.create({
      ...dto,
      fingerprint,
      status: 'active' as const,
      occurrenceCount: 1,
      lastFiredAt: now,
      resolvedAt: null,
    });

    const saved = await this.repo.save(alert);
    return { transition: 'fired', alert: saved };
  }

  /**
   * Close the active alert for a fingerprint. Returns transition 'noop' when
   * nothing was open.
   *
   * 'noop' is a real outcome, not a failure, and is deliberately distinguishable
   * from 'resolved': Alertmanager re-sends resolve events, and a resolve for an
   * alert we never recorded must not produce a "recovered!" message about a
   * service that was never reported down. Callers notify only on 'resolved'.
   */
  async resolveByFingerprint(fingerprint: string): Promise<ResolveResult> {
    if (!fingerprint) {
      throw new Error('resolveByFingerprint requires a fingerprint');
    }

    const alert = await this.repo.findOne({ where: { fingerprint, status: 'active' } });
    if (!alert) {
      this.logger.log(
        `[AlertsService] resolve for fingerprint=${fingerprint} matched no active alert — nothing to close`,
      );
      return { transition: 'noop', alert: null };
    }

    alert.status = 'resolved';
    alert.resolvedAt = new Date();
    const saved = await this.repo.save(alert);
    return { transition: 'resolved', alert: saved };
  }

  /**
   * Close every active alert whose `service` matches. Used by the deploy queue,
   * which knows the service it just deployed but has no Alertmanager
   * fingerprint of its own.
   */
  async resolveByService(service: string): Promise<ResolveResult[]> {
    if (!service) {
      throw new Error('resolveByService requires a service');
    }

    const active = await this.repo.find({ where: { service, status: 'active' } });
    if (active.length === 0) {
      return [{ transition: 'noop', alert: null }];
    }

    const now = new Date();
    const results: ResolveResult[] = [];
    for (const alert of active) {
      alert.status = 'resolved';
      alert.resolvedAt = now;
      results.push({ transition: 'resolved', alert: await this.repo.save(alert) });
    }
    return results;
  }

  /** @deprecated Use fire(); create() cannot dedup and produced the 326k-row table. */
  async create(dto: CreateAlertDto): Promise<Alert> {
    const { alert } = await this.fire(dto);
    return alert;
  }

  async acknowledge(id: string, dto: AcknowledgeAlertDto): Promise<Alert> {
    const alert = await this.repo.findOne({ where: { id } });
    if (!alert) throw new NotFoundException(`Alert ${id} not found`);
    alert.status = 'acknowledged';
    alert.acknowledgedBy = dto.acknowledgedBy;
    alert.acknowledgedAt = new Date();
    return this.repo.save(alert);
  }

  async resolve(id: string): Promise<Alert> {
    const alert = await this.repo.findOne({ where: { id } });
    if (!alert) throw new NotFoundException(`Alert ${id} not found`);
    alert.status = 'resolved';
    alert.resolvedAt = new Date();
    return this.repo.save(alert);
  }
}
