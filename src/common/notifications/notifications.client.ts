import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class NotificationsClient {
  private readonly logger = new Logger(NotificationsClient.name);
  private http: AxiosInstance;
  private telegramChatId: string;

  constructor(private readonly config: ConfigService) {
    const url = config.get<string>('notifications.url') || 'http://notifications-microservice:3368';
    const token = config.get<string>('digest.notificationsToken') || '';
    this.telegramChatId = config.get<string>('digest.telegramChatId') || '';

    this.http = axios.create({
      baseURL: url,
      timeout: 8000,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  }

  async sendTelegram(message: string): Promise<void> {
    if (!this.telegramChatId) {
      this.logger.warn('[NotificationsClient] TELEGRAM_CHAT_ID not set — skipping send');
      return;
    }
    await this.http.post('/notifications/send', {
      channel: 'telegram',
      type: 'custom',
      recipient: this.telegramChatId,
      message,
      service: 'monitoring-microservice',
    });
  }
}
