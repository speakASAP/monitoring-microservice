# TASK-001-bootstrap-service: Canonical IPS adoption

```yaml
id: TASK-001-bootstrap-service
status: completed
owner: project owner
created: 2026-08-30
last_updated: 2026-08-30
completeness_level: complete
upstream:
  - ../../BUSINESS.md
  - ../../SYSTEM.md
  - ../01_vision/VISION.md
goal_impact:
  - ../22_goal_impact/GOAL-IMPACT-TASK-001.md
execution_plan:
  - ../21_execution_plans/EP-TASK-001-bootstrap-service.md
```

## Objective

Adopt the canonical IPS documentation standard for this already-running production monitoring and observability service, consolidating pre-existing partial adoption artifacts under `docs/registry` into canonical locations.

## Upstream Links

`../../BUSINESS.md`, `../../SYSTEM.md`, and `../01_vision/VISION.md` provide approved purpose, system boundaries, and operator outcome.

## Goal Impact

See `../22_goal_impact/GOAL-IMPACT-TASK-001.md`.

## Project Invariant Impact

Preserves the invariants in `../17_governance/PROJECT_INVARIANTS.md`, particularly synchronized targets and Prometheus reload-only behavior.

## Sensitive-Data Classification

Operational configuration and alert metadata may be handled; secret values and raw production data are excluded from documentation and evidence.

## Contract and Schema Impact

Creates documentation contracts only; it does not change API, database, event, dashboard, or Kubernetes schemas.

## Replay and Determinism Impact

No runtime replay behavior changes. Documentation reports existing alert transition handling without modifying it.

## Scope

Complete canonical root contracts, protected intent, integration review, bootstrap delivery chain, state normalization, and validation evidence.

## Non-Goals

No runtime, deployment, stack, registry, secret, or configuration change is in scope.

## Acceptance Criteria

- [x] Required canonical artifacts contain concrete monitoring-service content.
- [x] All 16 integration capabilities have verified decisions in `ips-adoption.json`.
- [x] The legacy blocked planning signal remains recorded separately from bootstrap completion.
- [x] The planning adoption validator passes.

## Required Context

Read `../../BUSINESS.md`, `../../SYSTEM.md`, `../06_architecture/INTEGRATION_CONTRACT.md`, `../17_governance/PROJECT_INVARIANTS.md`, and `../21_execution_plans/EP-TASK-001-bootstrap-service.md`.

## Validation Task

Evidence is recorded in `../12_validation/VAL-TASK-001-bootstrap-service.md`.

## Required Gates

Run the planning adoption validator and inspect changed documentation for placeholder-free, source-grounded content.

## Parallel Workstream Context

Final integration only: canonical artifacts share traceability and are integrated by one documentation owner.
