# Roadmap

```yaml
id: ROADMAP-001
status: reviewed
owner: Operations Lead
created: 2026-06-13
last_updated: 2026-06-15
completeness_level: complete
upstream:
  - ../01_vision/VISION.md
downstream:
  - ../09_milestones/MS-001-ips-governance-baseline.md
  - ../09_milestones/MS-002-saas-access-and-customer-onboarding.md
  - ../09_milestones/MS-003-customer-integration-ingest-and-webhook-activation.md
  - ../09_milestones/MS-004-task003-production-deployment-and-smoke-validation.md
related_adrs:
  - ../07_decisions/ADR-001-use-ips-governance-baseline.md
```

## Sequencing Strategy

1. Establish IPS governance baseline.
2. Establish SaaS access, customer onboarding, and admin-only operational monitoring boundaries.
3. Activate customer integration ingest and webhook inputs with owner-scoped event visibility.
4. Deploy TASK-003 safely and capture production smoke-validation evidence before opening the next feature workstream.
5. Use IPS tasks for future registry, API, dashboard, alerting, and Kubernetes changes.
6. Keep validation evidence under `12_validation/` and operational gate reports under `reports/validation/`.

## Current Milestones

- `MS-001`: IPS governance baseline.
- `MS-002`: SaaS access and customer onboarding.
- `MS-003`: Customer integration ingest and webhook activation.
- `MS-004`: TASK-003 production deployment and smoke validation.

## Parallel Planning

Future implementation work should be decomposed into independent IPS tasks or workstreams with explicit shared contracts, integration owner, validation owner, and merge order. TASK-004 is dependency-gated on explicit deployment approval. Once approved, deployment execution, production smoke validation, documentation evidence, and final gate review can run as separate controlled workstreams with a single integration owner coordinating deploy order and evidence quality.

## Validation

Roadmap changes require traceability to vision and milestone updates.
