# PROMPT-TASK-001: IPS Governance Baseline

```yaml
id: PROMPT-TASK-001
status: generated
owner: Operations Lead
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../21_execution_plans/EP-TASK-001-implement-ips-governance-baseline.md
  - ../13_context_packages/CP-TASK-001-ips-governance-baseline.md
downstream:
  - ../12_validation/VAL-TASK-001-ips-governance-baseline.md
related_adrs:
  - ../07_decisions/ADR-001-use-ips-governance-baseline.md
```

## Role

Act as an implementation agent applying the company Intent Preservation System to monitoring-microservice.

## Task

Create the IPS governance baseline for monitoring-microservice without changing runtime behavior.

## Context

Use `CP-TASK-001`, `TASK-001`, and `EP-TASK-001` as the bounded context package and execution plan.

## Constraints

Do not include secrets, raw production data, or confidential identifiers. Do not modify `src/`, `web/`, or `k8s/` for this task.

## Acceptance criteria

- Required IPS docs and groups exist.
- Standard scripts/templates/contracts are present.
- Task, execution plan, goal-impact record, context package, prompt, and validation report are traceable.
- Audit, gates, build, and tests are run and summarized.

## Validation

Run the commands listed in `EP-TASK-001` and update `VAL-TASK-001` with status and evidence summary.
