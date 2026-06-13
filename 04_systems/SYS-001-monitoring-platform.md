# SYS-001: Monitoring Platform

```yaml
id: SYS-001
status: reviewed
owner: Operations Lead
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../01_vision/VISION.md
  - ../02_business_case/BUSINESS_CASE.md
downstream:
  - ../05_subsystems/SUB-001-monitoring-api.md
  - ../05_subsystems/SUB-002-monitoring-dashboard.md
  - ../05_subsystems/SUB-003-observability-stack.md
related_adrs:
  - ../07_decisions/ADR-001-use-ips-governance-baseline.md
```

## Purpose

Provide centralized observability for the Statex ecosystem through an API, dashboard, service registry, alerts, digest data, and Kubernetes monitoring stack.

## Responsibilities

- Serve health, service-status, registry, alert, digest, and webhook APIs.
- Provide a browser dashboard deployed as `monitoring-web`.
- Operate Prometheus, Grafana, Loki, Alertmanager, exporters, and Kubernetes manifests.
- Keep registry and probe configuration aligned.
- Preserve operational deployment rules documented in `SYSTEM.md` and `AGENTS.md`.

## Non-Responsibilities

- Owning business-domain data for monitored services.
- Acting as the authentication provider.
- Replacing Grafana or Prometheus native functions.

## Inputs

- Service registry entries.
- Health probe responses from ecosystem services.
- Alertmanager webhook payloads.
- PostgreSQL configuration for alert and snapshot persistence.
- Kubernetes manifests and deployment environment variables.

## Outputs

- `GET health` status.
- `GET api/services` live health view.
- `GET api/services/list` registry view.
- `GET api/alerts` alert data.
- Dashboard UI at `monitoring.alfares.cz`.
- Monitoring stack services including Grafana at `grafana.alfares.cz`.

## Dependencies

- PostgreSQL through `DB_*` settings.
- Kubernetes namespace `statex-apps`.
- Auth, logging, and notifications services for ecosystem integration.
- Prometheus, Grafana, Loki, Alertmanager, blackbox exporter, node exporter, and kube-state-metrics.

## Upstream Traceability

Traces to `VISION-001` goals for centralized health, registry consistency, operational APIs, and repeatable deployment.

## Downstream Artifacts

- `10_features/FEAT-001-ips-governance-baseline.md`
- `11_tasks/TASK-001-implement-ips-governance-baseline.md`
- Runtime code under `src/`, `web/`, and `k8s/`.

## Validation Criteria

- `npm run build` succeeds.
- `npm test` succeeds.
- IPS strict audit and gates run with recorded evidence.
- Deployment script remains the production deployment path.

## Open Questions

No open questions for the governance baseline.

## Validation

Validated by `12_validation/VAL-TASK-001-ips-governance-baseline.md`.
