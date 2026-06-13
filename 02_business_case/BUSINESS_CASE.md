# Business Case

```yaml
id: BUS-001
status: reviewed
owner: Operations Lead
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../01_vision/VISION.md
downstream:
  - ../04_systems/SYS-001-monitoring-platform.md
related_adrs: []
```

## Problem

Operators need a single observability service that combines service registry, service health, alert ingestion, digest data, and links into the monitoring stack.

## Users

- Operators maintaining the Statex production environment.
- Engineers adding or changing microservices.
- On-call responders investigating alerts.

## Value

The service reduces operational ambiguity by keeping service registry, health checks, dashboard data, and alert flows together.

## Success Metrics

- Health and registry endpoints remain available after deployment.
- Service registry and Prometheus targets are synchronized for monitored services.
- Alertmanager webhooks can be accepted by the API.
- Deployment script verifies expected health and registry behavior.

## Risks

- Registry drift between API configuration and Prometheus targets.
- Browser dashboard accidentally calling internal cluster URLs.
- Restarting Prometheus instead of reloading config, causing PVC lock disruption.
- Sensitive operational data leaking into docs or validation reports.

## Source Evidence

Derived from `SYSTEM.md`, `AGENTS.md`, `src/config/ecosystem-services.ts`, and `k8s/prometheus/configmap-config.yaml`.
