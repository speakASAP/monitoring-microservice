# Business: monitoring-microservice

```yaml
id: BUSINESS-monitoring-microservice
status: approved
owner: project owner
created: 2026-06-13
last_updated: 2026-08-30
completeness_level: complete
upstream:
  - docs/00_constitution/CONSTITUTION.md
  - docs/01_vision/VISION.md
downstream:
  - SYSTEM.md
  - docs/22_goal_impact/GOAL-IMPACT-TASK-001.md
```

## Problem

Statex operators need one reliable operational view of service health, alerts, dashboards, and monitoring-stack signals. Registry drift, unreachable health endpoints, and undelivered alerts reduce production visibility.

## Target Users and Stakeholders

Statex operators use the monitoring API, dashboard, Grafana, Alertmanager, and Prometheus-backed health views. Monitored services depend on accurate registry and probe configuration.

## Value Proposition

The service centralizes observability through health checks, dashboards, alerts, and monitoring-stack operations, preserving a consistent operational surface for the ecosystem.

## Goals

- Provide API monitoring on port 3395 and the dashboard on port 3396.
- Expose `https://monitoring.alfares.cz` and `https://grafana.alfares.cz`.
- Keep the ecosystem registry and Prometheus blackbox targets synchronized.
- Deliver Alertmanager-originated alerts through the notifications service.

## Non-Goals

- Owning other services' business-domain data or authentication authority.
- Replacing Grafana dashboards or Prometheus rule evaluation.
- Storing secrets in tracked files or IPS artifacts.

## Success Metrics

- `GET /health` reports API availability and `GET /api/services/list` returns the configured registry.
- Dashboard data remains consistent with the API registry through same-origin `/api/*` calls.
- Prometheus blackbox targets match monitored health endpoints.

## Business Constraints

- Reload Prometheus configuration rather than rollout restarting it because its single PVC can lock-crash.
- Preserve production monitoring surfaces across API, dashboard, and stack components.
- Keep secrets in Vault and External Secrets Operator rather than tracked files.
- Treat registry and Prometheus-target changes as one operational change.

## Approval

Status: approved
Approved by: project owner
Approval evidence: owner-confirmation: monitoring-microservice-onboarding-approved
