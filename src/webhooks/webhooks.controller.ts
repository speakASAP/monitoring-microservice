import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';

@Controller('api/webhooks')
export class WebhooksController {
  constructor(private readonly svc: WebhooksService) {}

  @Post('alertmanager')
  @HttpCode(200)
  alertmanager(@Body() payload: any) {
    return this.svc.handleAlertmanagerWebhook(payload);
  }
}
