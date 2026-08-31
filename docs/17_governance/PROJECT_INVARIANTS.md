# Project Invariants

```yaml
id: INVARIANTS-monitoring-microservice
status: validated
owner: project owner
created: 2026-06-13
last_updated: 2026-08-30
completeness_level: validated
upstream:
  - ../00_constitution/CONSTITUTION.md
  - ../01_vision/VISION.md
downstream:
  - ../11_tasks/TASK-001-bootstrap-service.md
```

## Purpose

State the operational rules that preserve reliable monitoring behavior.

## Applicability

These invariants apply to API, dashboard, registry, alert delivery, and Kubernetes monitoring-stack changes.

## Invariants

- `INV-MON-001`: Keep `src/config/ecosystem-services.ts` and `k8s/prometheus/configmap-config.yaml` synchronized.
- `INV-MON-002`: Dashboard browser calls use same-origin `/api/*`, not internal cluster URLs.
- `INV-MON-003`: Reload Prometheus through `POST /-/reload`; never rollout restart it because its single RWO PVC can lock-crash when two pods contend.
- `INV-MON-004`: Store operational secrets through Vault and External Secrets Operator, never tracked files.
- `INV-MON-005`: Persist, log, and forward Alertmanager transitions rather than silently discarding them.

## Exceptions

No exception to registry synchronization, secret handling, same-origin access, or Prometheus reload behavior is authorized by this documentation task. Future exceptions require project-owner approval.

## Review Cadence

Review these invariants when changing registry entries, public dashboard routing, alert delivery, or monitoring-stack deployment behavior.
