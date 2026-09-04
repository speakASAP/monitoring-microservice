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

Statex operators using the monitoring API, dashboard, and Telegram alerts.

## Core User Need

Operators need accurate health, alert, and dashboard information without exposing internal cluster addresses to browser clients.

## Key Outcomes

- Central registry and health status through the API and dashboard.
- Health-sweep results and deploy-queue outcomes in `statex-apps`.
- Same-origin public dashboard API access and alert notifications.

## Non-Goals

The service does not own other domain data, provide identity authority, collect or store metrics time series, or store secrets in documentation.

## Success Criteria

`/health` reports availability, `/api/services/list` returns the registry, and dashboard data follows that registry.

## Approval

Status: approved
Approved by: project owner
Approval evidence: owner-confirmation: monitoring-microservice-onboarding-approved
