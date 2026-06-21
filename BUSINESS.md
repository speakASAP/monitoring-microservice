# Business: monitoring-microservice

## Goal

Provide centralized observability for the Statex ecosystem through health checks, dashboards, alerts, and monitoring-stack operations.

## Constraints

- Keep the ecosystem registry and Prometheus blackbox targets in sync.
- Do not restart Prometheus through a deployment rollout; reload config instead.
- Keep secrets in Vault/ESO rather than tracked files.
- Preserve production monitoring surfaces for operators across API, dashboard, and stack components.

## Consumers

Statex operators using the monitoring API, dashboard, Grafana, Alertmanager, and Prometheus-backed health views.

## SLA

- API: `monitoring-microservice:3395`
- Frontend: `monitoring-web:3396`
- Dashboard URL: `https://monitoring.alfares.cz`
- Grafana URL: `https://grafana.alfares.cz`
