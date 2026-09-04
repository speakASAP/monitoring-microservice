import { Controller, Get, Post, Param, Body, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { MonitoringAdminGuard } from '../auth/monitoring-admin.guard';
import { MonitoringIngestGuard } from '../auth/monitoring-ingest.guard';
import { AlertsService } from './alerts.service';
import { AlertNotifier } from './alert-notifier';
import { NotificationsClient } from '../common/notifications/notifications.client';
import { CreateAlertDto } from './dto/create-alert.dto';
import { AcknowledgeAlertDto } from './dto/acknowledge-alert.dto';
import { FireAlertDto, ResolveAlertDto } from './dto/fire-alert.dto';

@Controller('api/alerts')
export class AlertsController {
  constructor(
    private readonly svc: AlertsService,
    private readonly notifier: AlertNotifier,
    private readonly notifications: NotificationsClient,
  ) {}

  @Get()
  @UseGuards(MonitoringAdminGuard)
  findAll(@Query('status') status?: string) {
    if (status === 'active') return this.svc.findActive();
    return this.svc.findAll();
  }

  /**
   * Machine ingest: record a firing alert and notify on the transition.
   *
   * Returns the transition so a shell caller can tell "newly broken" from
   * "still broken" without parsing the message.
   */
  @Post('fire')
  @UseGuards(MonitoringIngestGuard)
  async fire(@Body() dto: FireAlertDto) {
    const { transition, alert, notify } = await this.svc.fire(dto);
    const active = await this.svc.findActive();

    // `notify: false` is a deliberate silence, not a failure: either a repeat
    // inside its backoff window, or a flap reopen whose 🚨 was never retracted.
    // The transition is still returned so a caller can tell what happened.
    if (notify) {
      const message =
        transition === 'repeat'
          ? this.notifier.formatRepeat(alert, active)
          : this.notifier.formatFired(alert, active);
      await this.notifications.sendTelegram(message);
    }

    return {
      transition,
      notified: notify,
      id: alert.id,
      occurrenceCount: alert.occurrenceCount,
      flapCount: alert.flapCount,
      activeCount: active.length,
    };
  }

  /**
   * Machine ingest: the clear event. Silent when nothing was firing — a resolve
   * for a service that was never reported down must not announce a recovery.
   */
  @Post('resolve')
  @UseGuards(MonitoringIngestGuard)
  async resolveIngest(@Body() dto: ResolveAlertDto) {
    if (!dto.fingerprint && !dto.service) {
      throw new BadRequestException('resolve requires either fingerprint or service');
    }

    const results = dto.fingerprint
      ? [await this.svc.resolveByFingerprint(dto.fingerprint)]
      : await this.svc.resolveByService(dto.service!);

    const resolved = results.filter((r) => r.transition === 'resolved' && r.alert);
    if (resolved.length === 0) {
      return { transition: 'noop', resolvedCount: 0 };
    }

    // The ✅ message is NOT sent here. The alerts are marked resolved and leave
    // the digest immediately, but the announcement is owed rather than
    // delivered: AlertSweeper flushes it once the flap window passes without a
    // re-fire. A service that dips and returns therefore produces no message at
    // all, instead of a recovery it contradicts minutes later.
    const active = await this.svc.findActive();
    return {
      transition: 'resolved',
      resolvedCount: resolved.length,
      activeCount: active.length,
      notified: false,
      recoveryDeferred: true,
    };
  }

  @Post()
  @UseGuards(MonitoringAdminGuard)
  create(@Body() dto: CreateAlertDto) {
    return this.svc.create(dto);
  }

  @Post(':id/acknowledge')
  @UseGuards(MonitoringAdminGuard)
  acknowledge(@Param('id') id: string, @Body() dto: AcknowledgeAlertDto) {
    return this.svc.acknowledge(id, dto);
  }

  @Post(':id/resolve')
  @UseGuards(MonitoringAdminGuard)
  resolve(@Param('id') id: string) {
    return this.svc.resolve(id);
  }
}
