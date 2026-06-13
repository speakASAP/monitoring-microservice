import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthConsumerService } from './auth-consumer.service';

@Injectable()
export class MonitoringAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthConsumerService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    request.user = await this.auth.validateAuthorizationHeader(request.headers.authorization);
    return true;
  }
}
