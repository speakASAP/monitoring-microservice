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
- Repository entry: A registry entry shown in the dashboard but not health-probed.
- Alert: A lifecycle event raised by the health sweep or the deploy queue, stored and exposed by the API.
- Service health snapshot: Time-based record used by digest and health reporting.
- Deployment manifest: Kubernetes YAML under `k8s/` that defines API, web, and monitoring stack runtime behavior.

## Relationships

- Monitored services are defined in `src/config/ecosystem-services.ts`.
- Registry entries should match real service health endpoints in `src/config/ecosystem-services.ts`.
- Alerts are raised internally and through `POST /api/alerts`, and exposed through `GET /api/alerts`.
- Dashboard browser requests must use same-origin `/api/*` routes.
