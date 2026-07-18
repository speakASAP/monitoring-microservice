# SUB-002: Monitoring Dashboard

```yaml
id: SUB-002
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

Provide the browser UI for operational visibility into services, alerts, and monitoring status.

## Parent System

`docs/04_systems/SYS-001-monitoring-platform.md`

## Responsibilities

- Render service and alert views for operators.
- Call same-origin `/api/*` routes through ingress.
- Avoid internal cluster URLs in browser-side code.

## Interfaces

Next.js web app on port `3396`, exposed through `monitoring.alfares.cz`.

## Inputs

API responses from same-origin `/api/*` endpoints.

## Outputs

Operational dashboard pages and controls.

## Dependencies

Next.js app under `web/`, monitoring API ingress routes, and Kubernetes web deployment manifests.

## Data Ownership

Does not own persistent data. It renders monitoring API data.

## Failure Modes

- Browser code points to internal cluster DNS and cannot fetch data.
- Dashboard falls back to stale or empty data after API route mismatch.
- Web deployment image is not rebuilt after UI changes.

## Validation Criteria

Production deploy checks and browser/API verification after web changes.

## Validation

Validated as part of deployment evidence for web-facing changes.
