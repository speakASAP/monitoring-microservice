# EP-TASK-004: TASK-003 Production Deployment and Smoke Validation

```yaml
id: EP-TASK-004
status: validated
source_task: ../11_tasks/TASK-004-task003-production-deployment-and-smoke-validation.md
owner: Operations Lead
created: 2026-06-15
last_updated: 2026-06-15
completeness_level: complete
```

## Metadata

Owner: Operations Lead. Status: reviewed. Source task: `docs/11_tasks/TASK-004-task003-production-deployment-and-smoke-validation.md`. Lifecycle state: deployment and smoke validation complete. Execution mode: parallel-ready after deployment approval.

## Upstream Traceability

```yaml
constitution: docs/00_constitution/CONSTITUTION.md
vision: docs/01_vision/VISION.md
system: docs/04_systems/SYS-001-monitoring-platform.md
feature: docs/10_features/FEAT-004-task003-production-deployment-and-smoke-validation.md
goal_impact: docs/22_goal_impact/GOAL-IMPACT-TASK-004.md
task: docs/11_tasks/TASK-004-task003-production-deployment-and-smoke-validation.md
context_package: docs/13_context_packages/CP-TASK-004-task003-production-deployment-and-smoke-validation.md
upstream_validation: docs/12_validation/VAL-TASK-003-customer-integration-ingest-and-webhook-activation.md
```

## Goal Impact

The plan provides the controlled release path for customer integration ingest. It prevents future feature work from assuming TASK-003 is live before deployment and smoke evidence exist.

## Project Invariants

- Deployment uses the repository deployment script.
- No registry or Prometheus target edits are allowed.
- Same-origin browser access is verified through public monitoring routes.
- Sensitive evidence remains masked or synthetic.
- Any source fix discovered during smoke must become a new approved implementation task unless it is a trivial documentation correction.

## Sensitive-Data Handling

Classification: synthetic. Generated integration keys and Auth tokens may be used transiently for smoke checks but must never be printed, committed, stored in reports, or copied into prompts. Evidence records only status codes, route categories, masked identifiers, and aggregate outcomes.

## Contract Validation Plan

Validate TASK-003 production contracts:

- Public ingest endpoint accepts valid synthetic key submissions.
- Public webhook endpoint accepts valid synthetic key submissions.
- Invalid key submissions return generic unauthorized responses.
- Owner-scoped event listing works when an approved Auth smoke token is available.
- Operational admin APIs remain protected from anonymous access.

## Replay/Determinism Plan

Use synthetic event ids for smoke requests to make repeat submissions idempotency-aware. If existing smoke records are reused, evidence must state that behavior is idempotent and avoid raw payloads.

## Scope

Deployment, rollout checks, smoke validation, evidence capture, validation debt classification, TASK-004 validation report, graph update, gate report update, commit, and push.

## Non-Goals

Feature changes, schema changes, payment integration, registry updates, Prometheus target updates, Auth token changes, and deployment rollback unless deployment fails and owner approves rollback.

## Files to Inspect

- `scripts/deploy.sh`
- `docs/12_validation/VAL-TASK-003-customer-integration-ingest-and-webhook-activation.md`
- `docs/orchestrator/VALIDATION_DEBT.md`
- TASK-004 planning artifacts

## Files to Create

- TASK-004 validation report under the existing `12_validation` directory after deployment and smoke checks.

## Files to Modify

- TASK-004 task, execution plan, prompt, goal impact, validation report, graph, and gate reports.
- Validation debt ledger only if an out-of-scope blocker is confirmed.

## Files That Must Not Be Modified

- `docs/00_constitution/CONSTITUTION.md`
- `docs/01_vision/VISION.md`
- `src/config/ecosystem-services.ts`
- `k8s/prometheus/configmap-config.yaml`
- Runtime source files unless a new approved implementation task is created.

## Implementation Steps

1. Confirm explicit owner approval for deployment.
2. Confirm remote repo is clean and at the intended TASK-003 commit.
3. Run `./scripts/deploy.sh` from the remote monitoring repo.
4. Verify API and web rollout status.
5. Run synthetic valid-key ingest or webhook smoke checks.
6. Run invalid-key smoke check and confirm generic rejection.
7. Verify owner-scoped event listing if approved Auth smoke credentials exist; otherwise record `missing approved smoke Auth token`.
8. Verify anonymous operational API protection remains in place.
9. Update TASK-004 validation evidence and gates.
10. Commit and push TASK-004 closure artifacts.

## Test Plan

Smoke checks should use synthetic integration records and masked evidence. Avoid mutating real customer records. Record only route category, status result, and sanitized assertion summary.

## Validation Plan

- Deployment command result.
- Rollout status checks.
- Valid synthetic key smoke result.
- Invalid key smoke result.
- Owner-scoped event listing result or explicit missing credential marker.
- Strict documentation audit.
- Pre-coding gate.
- Deployment-readiness gate for TASK-004.

## Gate Commands

```bash
python3 scripts/strict_doc_audit.py --format markdown --fail-on-issues
python3 scripts/pre_coding_gate.py --root .
python3 scripts/deployment_readiness_gate.py --root . --target TASK-004
```

## Documentation Updates

- TASK-004 validation report after deployment and smoke checks.
- TASK-004 status and acceptance criteria after validation.
- Graph validation node and edge after validation report exists.
- Validation debt ledger only if needed.

## Rollback Plan

If deployment fails, stop and report failure output without secrets. If rollout succeeds but smoke fails, record the failing route category and decide whether to rollback or create a follow-up implementation task. Destructive rollback or database cleanup requires explicit owner approval.

## Agent Handoff Prompt

You are a deployment/smoke validation agent for TASK-004 in monitoring-microservice. Work only on the remote `alfares` repo. Do not deploy until owner approval is explicit. Use synthetic payloads only, do not print or persist raw credentials, and report sanitized deployment and smoke evidence.

## Completion Checklist

- [x] Deployment approval confirmed
- [x] Deployment complete
- [x] Rollout checks complete
- [x] Valid synthetic key smoke complete
- [x] Invalid key smoke complete
- [x] Authenticated event listing verified
- [x] Documentation updated
- [x] Gates passed
- [x] Commit and push complete
