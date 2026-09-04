# System: monitoring-microservice

```yaml
id: SYSTEM-monitoring-microservice
status: reviewed
owner: project owner
created: 2026-06-13
last_updated: 2026-08-30
completeness_level: complete
upstream:
  - BUSINESS.md
  - docs/01_vision/VISION.md
downstream:
  - docs/06_architecture/INTEGRATION_CONTRACT.md
  - docs/17_governance/PROJECT_INVARIANTS.md
```

## Purpose

Provide centralized observability for the Statex ecosystem through a NestJS API, a Next.js dashboard, health checks, alerts, and the Kubernetes monitoring stack.

## Responsibilities

- Run `monitoring-microservice` on port 3395 and `monitoring-web` on port 3396.
- Maintain the API health registry in `src/config/ecosystem-services.ts`.
- Persist alerts and incidents in PostgreSQL schema `monitoring`.
- Sweep registered service health endpoints, record alert transitions, log them, and send Telegram notifications.
- Accept alerts from the deploy queue and close them when a service is redeployed.

## Non-Responsibilities

The service does not own external service business data, authentication authority, payment processing, or browser access to internal cluster URLs.

## Inputs

API requests to `/health`, `/api/services`, `/api/services/list`, and `/api/alerts`; `DB_*` settings; and bearer-token validation through `POST /auth/validate`.

## Outputs

Same-origin dashboard API responses, persisted alert and incident data, structured logs sent to `logging-microservice`, and Telegram messages sent through `notifications-microservice`.

## Dependencies

`auth-microservice` validates bearer tokens; `db-server-postgres` holds alert and incident data; `logging-microservice` receives operational logs; and `notifications-microservice` delivers alerts. Vault path `secret/prod/monitoring-microservice` reaches the workload through External Secrets Operator.

## Upstream Traceability

`BUSINESS.md` defines the operator-facing observability goal and `docs/01_vision/VISION.md` defines the durable central-visibility outcome.

## Downstream Artifacts

`docs/06_architecture/INTEGRATION_CONTRACT.md`, `docs/17_governance/PROJECT_INVARIANTS.md`, and the bootstrap chain record integration, safety, and adoption evidence.

## Validation Criteria

The health endpoint responds, `/api/services/list` exposes the registry, source-level auth/logging/notifications/database paths remain present, and the IPS adoption validator passes.

## Open Questions

No owner-selected next lane exists among target inventory reconciliation, alert-noise reduction, dashboard validation, and deployment-readiness verification.

## Operational Invariant

`./scripts/deploy.sh` rebuilds API and web images, applies the manifests in `k8s/`, and rolls out only `monitoring-microservice` and `monitoring-web`. Registry changes live solely in `src/config/ecosystem-services.ts` and require rebuilding the API image.
