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

Statex operators use the monitoring API, dashboard, and Telegram alerts. Monitored services depend on an accurate registry in `src/config/ecosystem-services.ts`.

## Value Proposition

The service centralizes observability through health checks, dashboards, alerts, and monitoring-stack operations, preserving a consistent operational surface for the ecosystem.

## Goals

- Provide API monitoring on port 3395 and the dashboard on port 3396.
- Expose `https://monitoring.alfares.cz`.
- Keep the ecosystem registry accurate.
- Deliver health-sweep and deploy-queue alerts through the notifications service.

## Non-Goals

- Owning other services' business-domain data or authentication authority.
- Metrics collection, time-series storage, or dashboard visualization.
- Storing secrets in tracked files or IPS artifacts.

## Success Metrics

- `GET /health` reports API availability and `GET /api/services/list` returns the configured registry.
- Dashboard data remains consistent with the API registry through same-origin `/api/*` calls.
- Registry entries match real, reachable health endpoints.

## Business Constraints

- Preserve production monitoring surfaces across API, dashboard, and stack components.
- Keep secrets in Vault and External Secrets Operator rather than tracked files.
- Treat registry changes as one operational change.

## Approval

Status: approved
Approved by: project owner
Approval evidence: owner-confirmation: monitoring-microservice-onboarding-approved
