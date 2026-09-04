import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class LoggingService {
  private url: string;
  private token: string | undefined;

  constructor(private config: ConfigService) {
    this.url = config.get('logging.url') || 'http://logging-microservice:3367';
    this.token = config.get('logging.token');
  }

  async log(level: string, msg: string, extra?: Record<string, any>) {
    try {
      // The ingest endpoint requires a credential. Without this header it answers
      // 401 "Logging ingest credential required" and the catch below silently
      // drops it, which is how this service ended up with no log rows at all for
      // 2026-08-25..09-04 and why the digest outage could not be traced.
      // Extras go under `metadata`, never spread across the top level: the ingest
      // DTO sets forbidNonWhitelisted, so an unknown top-level key is rejected as
      // 400 "property <x> should not exist" and then discarded by the catch below.
      // Every structured call here carries extras (daily_digest_failed sends
      // {date, error}), so spreading them dropped exactly the events worth keeping.
      const hasExtra = !!extra && Object.keys(extra).length > 0;
      await axios.post(`${this.url}/api/logs`, {
        service: 'monitoring-microservice',
        level,
        msg,
        timestamp: new Date().toISOString(),
        duration_ms: 0,
        ...(hasExtra ? { metadata: extra } : {}),
      }, {
        timeout: 3000,
        headers: this.token ? { Authorization: `Bearer ${this.token}` } : undefined,
      });
    } catch {
      // Deliberately swallowed: logging must never break the caller. Anything
      // that must be seen when delivery fails is escalated over Telegram by the
      // caller rather than relied upon here.
      return;
    }
  }
}
