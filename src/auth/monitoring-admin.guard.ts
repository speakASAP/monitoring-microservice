import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthConsumerService } from './auth-consumer.service';

@Injectable()
export class MonitoringAdminGuard implements CanActivate {
  constructor(private readonly auth: AuthConsumerService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = await this.auth.validateAuthorizationHeader(request.headers.authorization);
    if (!this.auth.isMonitoringAdmin(user)) {
      throw new ForbiddenException('Monitoring admin role required');
    }
    request.user = user;
    return true;
  }
}
