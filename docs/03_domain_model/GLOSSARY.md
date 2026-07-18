# Glossary

```yaml
id: GLOSSARY-001
status: reviewed
owner: Operations Lead
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../01_vision/VISION.md
downstream:
  - ./CORE_ENTITIES.md
related_adrs: []
```

## Terms

- Alertmanager: Prometheus alert routing component that sends webhook notifications to this API.
- Blackbox exporter: Prometheus component used for HTTP health probes.
- Ecosystem registry: The service and repository catalog in `src/config/ecosystem-services.ts`.
- Grafana: Dashboard service for monitoring visualization.
- Loki: Log aggregation component in the monitoring stack.
- Monitoring dashboard: Next.js web application deployed as `monitoring-web`.
- Monitoring API: NestJS API deployed as `monitoring-microservice`.
- Prometheus reload: Config reload through `/-/reload`, used instead of rollout restart for config changes.
- Service health snapshot: Stored health state used by digest workflows.
