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
      // Never return quietly here: a missing chat id means the alerting channel
      // is dead, and the whole point of this client is that failures get seen.
      this.logger.error('[NotificationsClient] TELEGRAM_CHAT_ID not set — cannot deliver');
      throw new Error('TELEGRAM_CHAT_ID is not configured — Telegram delivery is unavailable');
    }
    await this.http.post('/notifications/send', {
      channel: 'telegram',
      type: 'custom',
      recipient: this.telegramChatId,
      message,
      service: 'monitoring-microservice',
    });
  }

  /**
   * Announce that a scheduled delivery failed.
   *
   * The daily digest went undelivered for nine days (2026-08-26 -> 2026-09-03)
   * while every layer stayed quiet: the send threw, `runDigest()` caught it, and
   * the LoggingService it reported into drops transport errors by design. The
   * only way that outage becomes visible on day one is a second message that
   * says so out loud.
   *
   * This deliberately carries a distinct subject. The notifications dedup key is
   * (channel, recipient, subject, type) plus content, and a null-subject message
   * to the owner chat is exactly what collided with the digest in the first
   * place, so the failure alarm must not reuse that shape.
   */
  async reportDeliveryFailure(reason: string): Promise<void> {
    if (!this.telegramChatId) {
      this.logger.error(
        `[NotificationsClient] digest delivery failed and no TELEGRAM_CHAT_ID is set to report it: ${reason}`,
      );
      throw new Error('TELEGRAM_CHAT_ID is not configured — cannot report delivery failure');
    }
    await this.http.post('/notifications/send', {
      channel: 'telegram',
      type: 'custom',
      recipient: this.telegramChatId,
      subject: 'Monitoring digest delivery FAILED',
      message:
        `⚠️ <b>Monitoring daily digest was NOT delivered</b>\n\n` +
        `Reason: ${reason}\n\n` +
        `The 08:00 UTC job ran and wrote its snapshot, but the digest did not reach this chat. ` +
        `A snapshot row is written before the send, so it is not evidence of delivery.`,
      service: 'monitoring-microservice',
    });
  }
}
