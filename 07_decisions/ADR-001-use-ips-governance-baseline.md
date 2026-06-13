# ADR-001: Use IPS Governance Baseline

```yaml
id: ADR-001
status: accepted
owner: Operations Lead
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../00_constitution/CONSTITUTION.md
  - ../01_vision/VISION.md
downstream:
  - ../11_tasks/TASK-001-implement-ips-governance-baseline.md
related_adrs: []
```

## Context

The monitoring-microservice existed with operational documentation in `SYSTEM.md` and `AGENTS.md`, but lacked the company Intent Preservation System governance structure.

## Decision

Adopt the IPS folder structure, reusable audit/gate scripts, documentation contracts, and traceability chain for future monitoring-microservice work.

## Consequences

- New implementation work must have a task, goal-impact record, execution plan, validation plan, and gate evidence.
- Immutable intent documents require human review for future changes.
- Sensitive production data must remain out of prompts, examples, and validation artifacts.
- Existing operational rules from `SYSTEM.md` and `AGENTS.md` remain authoritative for deployment behavior.

## Validation

Validated by strict documentation audit, pre-coding gate, deployment-readiness gate, `npm run build`, and `npm test` evidence recorded in `12_validation/VAL-TASK-001-ips-governance-baseline.md`.
