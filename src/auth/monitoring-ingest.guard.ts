import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

/**
 * Guards the alert INGEST endpoints (/api/alerts/fire, /api/alerts/resolve).
 *
 * These are called by machines, not people — the deploy queue posts here — so
 * MonitoringAdminGuard is the wrong gate twice over: it requires a human admin
 * role, and it validates through auth-microservice, which only accepts RS256
 * JWTs. The deploy queue's borrowed NOTIFICATION_SERVICE_TOKEN is a static
 * shared secret; auth-microservice rejects it with
 * "Unsupported token algorithm none; RS256 required" (verified against
 * production 2026-08-26), so a JWT-validating guard here would reject every
 * legitimate call and silently break deploy alerting.
 *
 * This follows the ecosystem's established static-service-token pattern —
 * notifications-microservice/src/auth/jwt-roles.guard.ts does the same thing:
 * constant-time comparison against a known secret, no JWT round-trip.
 *
 * Constant-time comparison matters: a plain === leaks the secret's prefix
 * through timing, one byte at a time.
 */
@Injectable()
export class MonitoringIngestGuard implements CanActivate {
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

    const accepted = [
      // The deploy queue borrows monitoring's own per-caller token, which is
      // present in this pod as NOTIFICATION_SERVICE_TOKEN. Reusing it means no
      // new credential is minted, rotated, or left to drift out of Vault.
      { name: 'deploy-queue', secret: process.env.NOTIFICATION_SERVICE_TOKEN },
      // Optional dedicated secret, if this is ever split off from the borrowed one.
      { name: 'alert-ingest', secret: process.env.ALERT_INGEST_TOKEN },
    ].filter((c) => !!c.secret && c.secret.length > 0);

    if (accepted.length === 0) {
      // Fail CLOSED. No configured secret must never mean "allow everyone".
      throw new ForbiddenException(
        'No alert-ingest credential is configured — alert ingest is closed',
      );
    }

    const match = accepted.find((c) => this.safeEqual(token, c.secret as string));
    if (!match) {
      throw new ForbiddenException('Principal is not permitted to write alert state');
    }

    request.user = { id: `service:${match.name}`, roles: [`internal:monitoring-microservice:ingest`] };
    return true;
  }

  private safeEqual(left: string, right: string): boolean {
    const l = Buffer.from(left);
    const r = Buffer.from(right);
    if (l.length !== r.length) return false;
    return timingSafeEqual(l, r);
  }
}
