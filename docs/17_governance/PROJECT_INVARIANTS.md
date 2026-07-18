# Project Invariants

```yaml
id: INVARIANTS-001
status: reviewed
owner: Operations Lead
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../00_constitution/CONSTITUTION.md
  - ../01_vision/VISION.md
downstream:
  - ../11_tasks/TASK-001-implement-ips-governance-baseline.md
related_adrs: []
```

## Invariants

1. `src/config/ecosystem-services.ts` is the service registry source for API and dashboard behavior.
2. `k8s/prometheus/configmap-config.yaml` must stay aligned with health-probed service registry entries.
3. Dashboard browser calls must use same-origin `/api/*` routes.
4. Prometheus config changes must reload Prometheus; do not rollout restart Prometheus for config-only changes.
5. Production secrets, raw operational data, customer identifiers, and confidential URLs must not be included in IPS artifacts.
6. Runtime source, dashboard source, and Kubernetes manifests require explicit task scope before modification.

## Validation

Each task must state invariant impact and validation evidence.
