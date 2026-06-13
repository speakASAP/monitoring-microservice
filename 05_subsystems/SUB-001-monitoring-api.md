# SUB-001: Monitoring API

```yaml
id: SUB-001
status: reviewed
owner: Operations Lead
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../04_systems/SYS-001-monitoring-platform.md
downstream:
  - ../10_features/FEAT-001-ips-governance-baseline.md
related_adrs: []
```

## Purpose

Expose NestJS endpoints for health, service status, registry data, alerts, digest data, marathon monitoring, and Alertmanager webhooks.

## Parent System

`04_systems/SYS-001-monitoring-platform.md`

## Responsibilities

- Serve API endpoints documented in `SYSTEM.md`.
- Use `src/config/ecosystem-services.ts` as registry source for dashboard and health checks.
- Persist alerts and health snapshots through TypeORM/PostgreSQL.
- Integrate notifications through the notifications client where applicable.

## Interfaces

- HTTP API on port `3395`.
- PostgreSQL through TypeORM.
- Alertmanager webhook input at `POST api/webhooks/alertmanager`.
- Dashboard API calls via ingress `/api/*`.

## Inputs

Registry configuration, webhook payloads, health probe requests, database configuration, and runtime environment variables.

## Outputs

Health responses, service status DTOs, alert responses, digest data, and webhook processing results.

## Dependencies

NestJS, TypeORM, PostgreSQL, Axios, Zod, Winston, Kubernetes deployment manifests, and ecosystem service health endpoints.

## Data Ownership

Owns alert records and service health snapshots for monitoring purposes. Does not own business records from monitored services.

## Failure Modes

- Database unavailable.
- Registry and Prometheus targets drift.
- Internal service health probes time out.
- Webhook payload shape changes without validation.

## Validation Criteria

`npm run build`, `npm test`, and endpoint checks in `./scripts/deploy.sh`.

## Validation

Validated by build/test/gate evidence in `12_validation/`.
