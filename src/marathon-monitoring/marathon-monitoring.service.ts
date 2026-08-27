import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class MarathonMonitoringService {
  private readonly logger = new Logger(MarathonMonitoringService.name);

  constructor(private readonly config: ConfigService) {}

  async getEventSummary(windowMinutes = 60, limit = 25) {
    const loggingUrl = (this.config.get<string>('logging.url') || 'http://logging-microservice:3367').replace(/\/$/, '');
    try {
      const token = (this.config.get<string>('logging.readToken') || process.env.LOGGING_READ_SERVICE_TOKEN)?.trim();
      if (!token) {
        throw new Error(
          'LOGGING_READ_SERVICE_TOKEN is not configured; the logging summary endpoint requires an authenticated service principal',
        );
      }
      const response = await axios.get(`${loggingUrl}/api/logs/marathon-events/summary`, {
        params: { windowMinutes, limit },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000,
      });
      return response.data?.data || response.data;
    } catch (error: any) {
      this.logger.error(
        `Logging marathon-events summary unavailable: ${error?.message || 'unknown error'} ` +
          `(url=${loggingUrl}/api/logs/marathon-events/summary, windowMinutes=${windowMinutes}, ` +
          `limit=${limit}, httpStatus=${error?.response?.status ?? 'n/a'})`,
        error?.stack,
      );
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
