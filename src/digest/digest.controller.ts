import { Controller, Post, UseGuards } from '@nestjs/common';
import { MonitoringAdminGuard } from '../auth/monitoring-admin.guard';
import { DailyDigestService } from './daily-digest.service';

@Controller('api/digest')
@UseGuards(MonitoringAdminGuard)
export class DigestController {
  constructor(private readonly digest: DailyDigestService) {}

  @Post('trigger')
  async trigger(): Promise<{ ok: boolean }> {
    await this.digest.runDigest();
    return { ok: true };
  }
}
