# Architecture Overview

```yaml
id: ARCH-001
status: reviewed
owner: Operations Lead
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../04_systems/SYS-001-monitoring-platform.md
downstream:
  - ../07_decisions/ADR-001-use-ips-governance-baseline.md
related_adrs:
  - ../07_decisions/ADR-001-use-ips-governance-baseline.md
```

## Runtime Architecture

- NestJS API runs as `monitoring-microservice` on port `3395`.
- Next.js dashboard runs as `monitoring-web` on port `3396`.
- Ingress exposes the dashboard and routes browser `/api/*` requests to the API.
- Alerts originate from the in-process health sweep and the deploy queue; no external telemetry stack is deployed (retired 2026-08-27).
- PostgreSQL stores alert and health snapshot data.

## Configuration Architecture

- Service registry source: `src/config/ecosystem-services.ts`.
- Monitored service registry: `src/config/ecosystem-services.ts`.
- Secrets enter through ESO from Vault path `secret/prod/monitoring-microservice` and must not be copied into docs.

## Deployment Architecture

`./scripts/deploy.sh` builds and pushes API and web images, applies Kubernetes manifests, rolls out API and web deployments, and verifies health and registry responses.

## Operational Constraints

- Same-origin browser API routes must be preserved.
- Registry changes must be reviewed against the services actually running.

## Validation

Architecture changes require build/test evidence, IPS gate evidence, and deployment-plan evidence when manifests or runtime behavior change.
