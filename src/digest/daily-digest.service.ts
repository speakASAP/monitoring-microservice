import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ServicesService } from '../services/services.service';
import { NotificationsClient } from '../common/notifications/notifications.client';
import { LoggingService } from '../common/logging/logging.service';
import { ServiceHealthSnapshot, SnapshotServiceEntry } from './service-health-snapshot.entity';
import { computeDiff, formatDigestMessage } from './digest.utils';

const CRON = process.env.DAILY_DIGEST_CRON || '0 8 * * *';

@Injectable()
export class DailyDigestService {
  private readonly logger = new Logger(DailyDigestService.name);

  constructor(
    @InjectRepository(ServiceHealthSnapshot)
    private readonly snapshotRepo: Repository<ServiceHealthSnapshot>,
    private readonly servicesService: ServicesService,
    private readonly notifications: NotificationsClient,
    private readonly logging: LoggingService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CRON)
  async sendMorningDigest(): Promise<void> {
    if (this.config.get<boolean>('digest.enabled') === false) return;
    await this.runDigest();
  }

  async runDigest(): Promise<void> {
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const yesterdayKey = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);

    try {
      const statuses = await this.servicesService.getServicesStatus();
      const todayEntries: SnapshotServiceEntry[] = statuses
        .filter((s) => s.monitorable)
        .map((s) => ({ name: s.name, healthy: s.healthy, responseTimeMs: s.responseTimeMs, error: s.error }));

      const yesterdaySnapshot = await this.snapshotRepo.findOne({
        where: { snapshotDate: yesterdayKey },
      });
      const previousServices = yesterdaySnapshot?.services ?? null;
      const diff = computeDiff(
        todayEntries,
        previousServices && previousServices.length > 0 ? previousServices : null,
      );
      const message = formatDigestMessage(todayEntries, diff, todayKey);

      await this.snapshotRepo.upsert(
        { snapshotDate: todayKey, services: todayEntries },
        { conflictPaths: ['snapshotDate'] },
      );

      await this.notifications.sendTelegram(message);

      await this.logging.log('info', 'daily_digest_sent', {
        date: todayKey,
        total: todayEntries.length,
        failing: todayEntries.filter((s) => !s.healthy).length,
        newlyFailing: diff?.newlyFailing.length ?? 0,
        recovered: diff?.recovered.length ?? 0,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[DailyDigestService] digest failed: ${msg}`);
      await this.logging.log('error', 'daily_digest_failed', { date: todayKey, error: msg });
    }
  }
}
