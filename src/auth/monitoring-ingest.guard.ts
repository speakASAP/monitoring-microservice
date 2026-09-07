import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Roles that authorize alert / credential ingest writes.
 *
 * `ingest` is the least privilege for these routes. `global:superadmin` is
 * deliberately absent: it is a human role, and a service token must never
 * carry it.
 */
const INGEST_ROLES: ReadonlySet<string> = new Set([
  'internal:monitoring-microservice:ingest',
]);

/**
 * Auth RS256 gate for alert ingest and credential-report endpoints.
 *
 * Validates Authorization Bearer via POST AUTH_SERVICE_URL/auth/validate and
 * requires `internal:monitoring-microservice:ingest`.
 *
 * Static NOTIFICATION_SERVICE_TOKEN / ALERT_INGEST_TOKEN compares are deleted —
 * not flag-gated. Callers must present a per-pair Auth JWT (env name for
 * in-pod / deploy-queue senders: MONITORING_INGEST_SERVICE_TOKEN).
 */
@Injectable()
export class MonitoringIngestGuard implements CanActivate {
  private readonly authServiceUrl = (
    process.env.AUTH_SERVICE_URL || 'http://auth-microservice:3370'
  ).replace(/\/+$/, '');
  private readonly authValidateTimeoutMs = Number(
    process.env.AUTH_VALIDATE_TIMEOUT_MS || 3000,
  );

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers?.authorization;

    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const roles = await this.validateRoles(token);
    if (!roles.some((role) => INGEST_ROLES.has(role))) {
      throw new ForbiddenException('Principal is not permitted to write alert state');
    }

    request.user = {
      id: 'service:monitoring-ingest',
      roles: roles.filter((role) => INGEST_ROLES.has(role)),
    };
    return true;
  }

  private async validateRoles(token: string): Promise<string[]> {
    const controller = new AbortController();
    const timeoutMs =
      Number.isFinite(this.authValidateTimeoutMs) && this.authValidateTimeoutMs > 0
        ? this.authValidateTimeoutMs
        : 3000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${this.authServiceUrl}/auth/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        signal: controller.signal,
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'monitoring_ingest_auth_validate_unreachable',
          message: 'Auth validate unreachable during monitoring ingest',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      throw new UnauthorizedException('Invalid token');
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new UnauthorizedException('Invalid token');
    }

    let data: { valid?: boolean; user?: { roles?: unknown } };
    try {
      data = (await response.json()) as { valid?: boolean; user?: { roles?: unknown } };
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    if (!data.valid || !data.user) {
      throw new UnauthorizedException('Invalid token');
    }

    return Array.isArray(data.user.roles)
      ? data.user.roles.filter((role): role is string => typeof role === 'string')
      : [];
  }
}
