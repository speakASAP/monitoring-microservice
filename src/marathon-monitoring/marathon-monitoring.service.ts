import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class MarathonMonitoringService {
  constructor(private readonly config: ConfigService) {}

  async getEventSummary(windowMinutes = 60, limit = 25) {
    const loggingUrl = (this.config.get<string>('logging.url') || 'http://logging-microservice:3367').replace(/\/$/, '');
    try {
      const response = await axios.get(`${loggingUrl}/api/logs/marathon-events/summary`, {
        params: { windowMinutes, limit },
        timeout: 5000,
      });
      return response.data?.data || response.data;
    } catch (error: any) {
      return {
        service: 'marathon',
        generatedAt: new Date().toISOString(),
        windowMinutes,
        totals: { events: 0, errors: 0, warnings: 0 },
        codes: [],
        recent: [],
        unavailable: true,
        error: error?.message || 'logging summary unavailable',
      };
    }
  }
}
