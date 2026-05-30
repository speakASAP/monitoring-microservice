import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class LoggingService {
  private url: string;

  constructor(private config: ConfigService) {
    this.url = config.get('logging.url') || 'http://logging-microservice:3367';
  }

  async log(level: string, msg: string, extra?: Record<string, any>) {
    try {
      await axios.post(`${this.url}/api/logs`, {
        service: 'monitoring-microservice',
        level,
        msg,
        timestamp: new Date().toISOString(),
        duration_ms: 0,
        ...extra,
      }, { timeout: 3000 });
    } catch {}
  }
}
