# Monitoring Microservice Vision

```yaml
id: VISION-monitoring-microservice
status: approved
owner: project owner
created: 2026-06-13
last_updated: 2026-08-30
completeness_level: complete
upstream:
  - ../00_constitution/CONSTITUTION.md
downstream:
  - ../../BUSINESS.md
  - ../../SYSTEM.md
```

## One-Sentence Vision

Give Statex operators one reliable place to understand ecosystem health, alerts, dashboards, and observability signals.

## Problem Statement

Fragmented or stale health and alerting information prevents operators from safely understanding production conditions.

## Target Users

Statex operators using the monitoring API, dashboard, Grafana, Alertmanager, and Prometheus-backed health views.

## Core User Need

Operators need accurate health, alert, and dashboard information without exposing internal cluster addresses to browser clients.

## Key Outcomes

- Central registry and health status through the API and dashboard.
- Prometheus, Grafana, Alertmanager, and exporter signals in `statex-apps`.
- Same-origin public dashboard API access and alert notifications.

## Non-Goals

The service does not own other domain data, provide identity authority, replace Grafana or Prometheus evaluation, or store secrets in documentation.

## Success Criteria

`/health` reports availability, `/api/services/list` returns the registry, dashboard data follows that registry, and blackbox targets align with monitored health endpoints.

## Approval

Status: approved
Approved by: project owner
Approval evidence: owner-confirmation: monitoring-microservice-onboarding-approved
