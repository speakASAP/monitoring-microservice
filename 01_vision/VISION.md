# Monitoring Microservice Vision

```yaml
id: VISION-001
status: approved
owner: Project Sponsor / Product Owner
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../00_constitution/CONSTITUTION.md
downstream:
  - ../02_business_case/BUSINESS_CASE.md
  - ../04_systems/SYS-001-monitoring-platform.md
related_adrs:
  - ../07_decisions/ADR-001-use-ips-governance-baseline.md
```

## Purpose

The monitoring-microservice exists to give operators one reliable place to understand health, alerts, dashboards, and observability signals across the Statex ecosystem.

## Vision Goals

- Maintain a centralized registry of services and repositories that can be surfaced by the API and dashboard.
- Monitor ecosystem health through Kubernetes-hosted Prometheus, Grafana, Loki, Alertmanager, blackbox exporter, node exporter, and kube-state-metrics.
- Provide operational APIs for service status, alert review, health checks, daily digest data, and Alertmanager webhooks.
- Keep dashboard browser calls same-origin through `/api/*` so the public UI does not depend on internal cluster DNS.
- Deploy consistently through `./scripts/deploy.sh` using the existing Kubernetes namespace and image flow.

## Non-Goals

- This service is not the owner of business-domain data for other microservices.
- This service is not an authentication authority.
- This service is not a replacement for Grafana dashboards or Prometheus rule evaluation.
- This service must not store secrets in documentation or prompt artifacts.

## Success Criteria

- `/health` reports service availability.
- `/api/services/list` returns the configured ecosystem registry.
- Dashboard service data remains consistent with the API registry.
- Prometheus blackbox targets are kept in sync with monitored service health endpoints.
- Deployment evidence confirms API and web rollout after changes.

## Source Evidence

This vision is derived from `SYSTEM.md`, `AGENTS.md`, `package.json`, and existing Kubernetes manifests in this repository.
