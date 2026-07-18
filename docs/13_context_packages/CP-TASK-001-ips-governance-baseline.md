# CP-TASK-001: IPS Governance Baseline Context Package

```yaml
id: CP-TASK-001
status: generated
owner: Operations Lead
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../11_tasks/TASK-001-implement-ips-governance-baseline.md
downstream:
  - ../14_prompts/PROMPT-TASK-001-ips-governance-baseline.md
related_adrs:
  - ../07_decisions/ADR-001-use-ips-governance-baseline.md
```

## Target task

`../11_tasks/TASK-001-implement-ips-governance-baseline.md`

## Upstream traceability

Vision, system, feature, task, goal-impact, execution-plan, and ADR artifacts for the IPS governance baseline.

## Included documents

- `../00_constitution/CONSTITUTION.md`
- `../01_vision/VISION.md`
- `../04_systems/SYS-001-monitoring-platform.md`
- `../10_features/FEAT-001-ips-governance-baseline.md`
- `../11_tasks/TASK-001-implement-ips-governance-baseline.md`
- `../21_execution_plans/EP-TASK-001-implement-ips-governance-baseline.md`
- `../22_goal_impact/GOAL-IMPACT-TASK-001.md`
- `../07_decisions/ADR-001-use-ips-governance-baseline.md`

## Excluded documents

- Runtime secrets and `.env` files.
- Production logs or raw operational exports.
- Unrelated dependency files and generated `node_modules` content.

## Constraints

Do not change runtime source, dashboard source, Kubernetes manifests, or production deployment state for this task.

## Agent prompt

Use the execution plan to implement only the IPS governance baseline and collect validation evidence.

## Validation instructions

Run strict audit, pre-coding gate, deployment-readiness gate, `npm run build`, and `npm test`.
