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
- Prometheus, Grafana, Loki, Alertmanager, and exporters run in Kubernetes namespace `statex-apps`.
- PostgreSQL stores alert and health snapshot data.

## Configuration Architecture

- Service registry source: `src/config/ecosystem-services.ts`.
- Prometheus blackbox probe targets: `k8s/prometheus/configmap-config.yaml`.
- Secrets enter through ESO from Vault path `secret/prod/monitoring-microservice` and must not be copied into docs.

## Deployment Architecture

`./scripts/deploy.sh` builds and pushes API and web images, applies Kubernetes manifests, reloads Prometheus configuration, rolls out API and web deployments, and verifies health and registry responses.

## Operational Constraints

- Do not rollout restart Prometheus for config-only changes.
- Same-origin browser API routes must be preserved.
- Registry and Prometheus target changes must be reviewed together.

## Validation

Architecture changes require build/test evidence, IPS gate evidence, and deployment-plan evidence when manifests or runtime behavior change.
