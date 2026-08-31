# GOAL-IMPACT-TASK-001: Canonical IPS adoption

```yaml
id: GOAL-IMPACT-TASK-001
status: validated
owner: project owner
created: 2026-08-30
last_updated: 2026-08-30
upstream:
  - ../01_vision/VISION.md
downstream:
  - ../21_execution_plans/EP-TASK-001-bootstrap-service.md
```

## Goal

Make the already-running monitoring service a truthful, validator-passing IPS adoption record without changing its runtime behavior.

## Contribution

Canonical documents consolidate the pre-existing partial registry and planning artifacts into the standard task, plan, validation, state, and integration paths.

## Success Metric

The adoption validator reports all 16 capability decisions and no document errors for monitoring-microservice.

## Invariant Compatibility

The work records and preserves synchronized targets, same-origin dashboard access, secret handling, and the Prometheus reload-only rule.

## Upstream and Downstream Links

The task is `../11_tasks/TASK-001-bootstrap-service.md`; implementation evidence is in `../21_execution_plans/EP-TASK-001-bootstrap-service.md`; validation is `../12_validation/VAL-TASK-001-bootstrap-service.md`.

## Validation Method

Run `python3 ../intent-preservation-system/scripts/validate_adoption_profile.py --root . --phase planning` from the repository parent context.
