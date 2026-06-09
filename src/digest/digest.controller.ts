import { Controller, Post } from '@nestjs/common';
import { DailyDigestService } from './daily-digest.service';

@Controller('api/digest')
export class DigestController {
  constructor(private readonly digest: DailyDigestService) {}

  @Post('trigger')
  async trigger(): Promise<{ ok: boolean }> {
    await this.digest.runDigest();
    return { ok: true };
  }
}
