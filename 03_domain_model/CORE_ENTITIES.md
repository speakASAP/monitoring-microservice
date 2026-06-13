# Core Entities

```yaml
id: CORE-ENTITIES-001
status: reviewed
owner: Operations Lead
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ./GLOSSARY.md
  - ../01_vision/VISION.md
downstream:
  - ../04_systems/SYS-001-monitoring-platform.md
related_adrs: []
```

## Entities

- Monitored service: A service entry with name, kind, URL or health path, status expectations, and dashboard visibility.
- Repository entry: A registry entry shown in the dashboard but not probed by Prometheus.
- Alert: Alertmanager-derived event stored and exposed by the API.
- Service health snapshot: Time-based record used by digest and health reporting.
- Deployment manifest: Kubernetes YAML under `k8s/` that defines API, web, and monitoring stack runtime behavior.

## Relationships

- Monitored services are defined in `src/config/ecosystem-services.ts`.
- Prometheus blackbox targets should match service health endpoints in `k8s/prometheus/configmap-config.yaml`.
- Alerts are received through `/api/webhooks/alertmanager` and exposed through `/api/alerts`.
- Dashboard browser requests must use same-origin `/api/*` routes.
