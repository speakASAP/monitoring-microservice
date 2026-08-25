import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthConsumerService } from './auth-consumer.service';

@Injectable()
export class MonitoringAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthConsumerService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = await this.auth.validateAuthorizationHeader(request.headers.authorization);
    // A valid token is not by itself an authorization decision. Without this
    // check any principal in the ecosystem could manage customer integrations,
    // including rotating and deleting their API keys.
    if (!this.auth.isMonitoringOperator(user)) {
      throw new ForbiddenException('Monitoring operator role required');
    }
    request.user = user;
    return true;
  }
}
