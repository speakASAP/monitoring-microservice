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
- The service registry lists every monitored service with a reachable health endpoint.
- Alerts can be raised by the health sweep and by the deploy queue.
- Deployment script verifies expected health and registry behavior.

## Risks

- Registry drift between API configuration and the services actually running.
- Browser dashboard accidentally calling internal cluster URLs.
- Presenting coverage the service no longer has after an alert source is retired.
- Sensitive operational data leaking into docs or validation reports.

## Source Evidence

Derived from `SYSTEM.md`, `AGENTS.md`, and `src/config/ecosystem-services.ts`.
