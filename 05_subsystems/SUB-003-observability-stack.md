# SUB-003: Observability Stack

```yaml
id: SUB-003
status: reviewed
owner: Operations Lead
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../04_systems/SYS-001-monitoring-platform.md
downstream: []
related_adrs: []
```

## Purpose

Run the Kubernetes monitoring components that collect, store, alert, and visualize operational telemetry.

## Parent System

`04_systems/SYS-001-monitoring-platform.md`

## Responsibilities

- Manage Prometheus, Grafana, Loki, Alertmanager, blackbox exporter, node exporter, and kube-state-metrics manifests.
- Keep blackbox HTTP probe targets aligned with the service registry.
- Reload Prometheus config after target changes.

## Interfaces

Kubernetes manifests under `k8s/`, Prometheus reload endpoint, Grafana ingress, and service ports documented in `SYSTEM.md`.

## Inputs

Kubernetes manifests, ConfigMaps, PVCs, service endpoints, and alert rules.

## Outputs

Metrics, dashboards, logs, alert routes, and probe status.

## Dependencies

Kubernetes `statex-apps` namespace, PVCs, container registry, and service DNS.

## Data Ownership

Owns monitoring telemetry and alerting configuration, not application business data.

## Failure Modes

- Prometheus rollout restart creates PVC lock contention.
- Probe targets drift from registry.
- Grafana datasource/dashboard config becomes inconsistent.

## Validation Criteria

Deploy script applies manifests and reloads Prometheus without rollout restart for config-only changes.

## Validation

Validated by deployment evidence and operational checks.
