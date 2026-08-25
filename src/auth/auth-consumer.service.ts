import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export type MonitoringAuthUser = {
  id: string;
  email?: string;
  type?: string;
  roles: string[];
};

@Injectable()
export class AuthConsumerService {
  constructor(private readonly config: ConfigService) {}

  async validateAuthorizationHeader(header?: string): Promise<MonitoringAuthUser> {
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const authUrl = (this.config.get<string>('auth.url') || 'http://auth-microservice:3370').replace(/\/$/, '');
    try {
      const response = await axios.post(`${authUrl}/auth/validate`, { token }, { timeout: 5000 });
      const user = response.data?.user;
      if (!response.data?.valid || !user?.id) {
        throw new UnauthorizedException('Invalid token');
      }

      return {
        id: user.id,
        email: user.email,
        type: user.type,
        roles: Array.isArray(user.roles) ? user.roles : [],
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid token');
    }
  }

  getAdminRoles(): string[] {
    const configured = this.config.get<string>('monitoring.adminRoles') || '';
    return configured
      .split(',')
      .map((role) => role.trim())
      .filter(Boolean);
  }

  isMonitoringAdmin(user: MonitoringAuthUser): boolean {
    const allowed = this.getAdminRoles();
    return allowed.some((role) => user.roles.includes(role));
  }

  /**
   * Roles allowed on operator surfaces (customer-integration management).
   * Admins always qualify; `MONITORING_OPERATOR_ROLES` may widen it.
   *
   * Authentication alone is not authorization: MonitoringAuthGuard previously
   * admitted any token Auth considered valid, so any principal in the ecosystem
   * could rotate or delete customer integration keys.
   */
  getOperatorRoles(): string[] {
    const configured = this.config.get<string>('monitoring.operatorRoles') || '';
    const extra = configured
      .split(',')
      .map((role) => role.trim())
      .filter(Boolean);
    return [...this.getAdminRoles(), ...extra];
  }

  isMonitoringOperator(user: MonitoringAuthUser): boolean {
    const allowed = this.getOperatorRoles();
    return allowed.some((role) => user.roles.includes(role));
  }
}
