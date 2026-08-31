# EP-TASK-001-bootstrap-service: Canonical IPS adoption

```yaml
id: EP-TASK-001-bootstrap-service
status: closed
owner: project owner
created: 2026-08-30
last_updated: 2026-08-30
completeness_level: complete
source_task: ../11_tasks/TASK-001-bootstrap-service.md
goal_impact:
  - ../22_goal_impact/GOAL-IMPACT-TASK-001.md
validation:
  - ../12_validation/VAL-TASK-001-bootstrap-service.md
```

## Upstream Traceability

Use `../../BUSINESS.md`, `../../SYSTEM.md`, `../11_tasks/TASK-001-bootstrap-service.md`, and `../22_goal_impact/GOAL-IMPACT-TASK-001.md`.

## Scope

Consolidate partial IPS adoption documents into canonical required artifacts and complete the integration review.

## Non-Goals

Do not change runtime code, APIs, database schema, secrets, deployment manifests, registry, or monitoring stack.

## Project Invariants

Preserve all `INV-MON` invariants, especially config synchronization and Prometheus reload behavior.

## Sensitive-Data Handling

Use source paths and sanitized behavior descriptions only; do not record secret values or raw production payloads.

## Contract Validation Plan

Inspect actual auth, TypeORM, logging, notifications, webhook, configuration, and deployment sources before recording contracts.

## Replay and Determinism Plan

Document existing Alertmanager transition behavior without changing retry or replay semantics.

## Files to Inspect

Root contracts, existing `docs/` artifacts, `src/`, `k8s/`, `scripts/deploy.sh`, and the central adoption validator.

## Files to Create

Create missing canonical integration, bootstrap task, plan, validation, and adoption-profile artifacts.

## Files to Modify

Normalize root contracts, protected intent, invariants, state, goal impact, and validation debt.

## Files That Must Not Be Modified

Do not modify runtime source, web source, Kubernetes manifests, deployment scripts, secret sources, ecosystem repository catalog, or the live monitoring stack.

## Implementation Steps

1. Read source and partial adoption evidence.
2. Run the non-destructive scaffolder.
3. Fill canonical documents with verified facts.
4. Validate and record evidence.

## Parallel Execution

| Workstream | Status | Owner role | Allowed files | Dependencies | Validation | Merge order |
| --- | --- | --- | --- | --- | --- | --- |
| Documentation consolidation | completed | documentation owner | canonical IPS files | source review | adoption validator | first and only |
| Runtime changes | blocked | project owner | none | owner-selected lane | separate task | after adoption |
| Final integration | completed | documentation owner | profile and validation | completed documents | adoption validator | last |

## Blockers

The separate implementation queue remains blocked until the project owner selects its next lane; this does not block completed documentation adoption.

## Test Plan

Run the planning adoption validator; runtime tests are outside this documentation-only scope.

## Validation Plan

Map every required document section and integration capability to the validator and source evidence.

## Gate Commands

`python3 ../intent-preservation-system/scripts/validate_adoption_profile.py --root monitoring-microservice --phase planning` is run from `/home/ssf/Documents/Github`.

## Documentation Updates

Update canonical root, governance, integration, bootstrap, state, and debt documents only.

## Rollback Plan

Revert the documentation commit if canonical records are found inconsistent with repository source; no runtime rollback is needed.

## Handoff

The project owner selects the next implementation lane; future workers preserve this completed adoption baseline.

## Completion Checklist

Protected intent is approved, the profile is valid, integration decisions are complete, and no runtime or live-stack work occurred.
