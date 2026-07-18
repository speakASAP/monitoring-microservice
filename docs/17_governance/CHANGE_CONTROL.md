# Change Control

```yaml
id: CHANGE-CONTROL-001
status: reviewed
owner: Operations Lead
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../00_constitution/CONSTITUTION.md
downstream: []
related_adrs: []
```

## Policy

- Immutable intent changes require human-approved amendment records under `docs/17_governance/amendments/`.
- Architecture changes require an ADR.
- Runtime changes require a task, execution plan, validation plan, and evidence.
- Deployment-impacting changes require deployment-readiness evidence.

## Review Evidence

Review should confirm traceability, invariant impact, sensitive-data handling, contract/schema impact, replay/determinism impact, and validation results.
