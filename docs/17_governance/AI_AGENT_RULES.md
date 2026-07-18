# AI Agent Rules

```yaml
id: AI-RULES-001
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

## Rules

- Read `AGENTS.md`, `SYSTEM.md`, and relevant IPS artifacts before code changes.
- Do not modify immutable docs without explicit human direction and amendment context.
- Do not invent goals, approvals, or production evidence.
- Do not include secrets or raw production data in prompts, examples, tests, logs, plans, or reports.
- Preserve project invariants in `PROJECT_INVARIANTS.md`.
- Report any deviation from the execution plan.
