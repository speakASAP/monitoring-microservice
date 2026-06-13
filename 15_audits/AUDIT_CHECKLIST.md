# Audit Checklist

```yaml
id: AUDIT-CHECKLIST-001
status: reviewed
owner: Operations Lead
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../23_documentation_contracts/DOCUMENTATION_COMPLETENESS_STANDARD.md
downstream: []
related_adrs: []
```

## Checklist

- Required IPS source documents exist.
- Required document groups contain at least one artifact.
- Tasks include upstream, goal-impact, execution-plan, validation, sensitive-data, contract, replay, and gate sections.
- Execution plans include scope, files, implementation steps, test plan, validation plan, gates, rollback, and handoff prompt.
- Validation reports include evidence and recommendation.
- Sensitive data is absent from prompts, plans, examples, logs, and reports.
- Operational invariants are preserved.
