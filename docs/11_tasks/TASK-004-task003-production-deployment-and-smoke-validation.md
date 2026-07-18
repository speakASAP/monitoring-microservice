# TASK-004: TASK-003 Production Deployment and Smoke Validation

```yaml
id: TASK-004
status: validated
owner: Operations Lead
created: 2026-06-15
last_updated: 2026-06-15
completeness_level: complete
upstream:
  - ../10_features/FEAT-004-task003-production-deployment-and-smoke-validation.md
goal_impact:
  - ../22_goal_impact/GOAL-IMPACT-TASK-004.md
execution_plan:
  - ../21_execution_plans/EP-TASK-004-task003-production-deployment-and-smoke-validation.md
```

## Objective

Deploy the validated TASK-003 customer integration ingest changes to production and collect sanitized smoke evidence for customer ingest, webhook, event listing, and access-boundary behavior.

## Upstream Links

- `docs/10_features/FEAT-004-task003-production-deployment-and-smoke-validation.md`
- `docs/09_milestones/MS-004-task003-production-deployment-and-smoke-validation.md`
- `docs/12_validation/VAL-TASK-003-customer-integration-ingest-and-webhook-activation.md`
- `docs/04_systems/SYS-001-monitoring-platform.md`
- `docs/16_operations/LOCAL_WORKFLOW.md`

## Goal Impact

TASK-004 turns TASK-003 from merged code into verified production behavior. It protects operational trust by requiring deployment evidence and smoke checks before further customer-ingest features build on the live system.

Goal impact record: `docs/22_goal_impact/GOAL-IMPACT-TASK-004.md`.

## Project Invariant Impact

- Deployment invariant: production deploy must use `./scripts/deploy.sh` from the remote repository.
- Sensitive data invariant: smoke evidence must not include raw keys, Authorization headers, Auth tokens, customer identifiers, or production payloads.
- Same-origin invariant: customer dashboard verification must use public same-origin `/api/*` behavior.
- Registry and Prometheus invariants: no registry or Prometheus target changes are in scope.
- Runtime source scope invariant: source changes are out of scope unless deployment or smoke discovers a blocker requiring a new approved implementation task.

## Sensitive-Data Classification

Classification: synthetic

Smoke checks must use synthetic integration names, synthetic event payloads, and masked credential evidence. If an approved Auth smoke token or generated integration key is needed, it must be used transiently and never written into docs, reports, logs, or prompts.

## Contract/Schema Impact

No new schema or API contract is planned. TASK-004 validates the contracts implemented by TASK-003: customer ingest, customer webhook, and owner-scoped event listing.

## Replay/Determinism Impact

Smoke checks should use client-supplied synthetic event ids so repeated execution is idempotency-aware. Evidence should record aggregate outcomes rather than raw request or response secrets.

## Scope

- Confirm remote repo is clean and points at the intended TASK-003 commit.
- Run `./scripts/deploy.sh` after explicit deployment approval.
- Verify rollout status for API and web deployments.
- Run synthetic smoke checks for public ingest/webhook valid-key acceptance and invalid-key rejection.
- Verify owner-scoped event listing when approved Auth smoke credentials are available.
- Verify anonymous operational API protection remains in place.
- Record sanitized evidence and validation debt decisions if credentials or environment access are unavailable.

## Non-Goals

- New feature implementation.
- Billing, customer provisioning, or production customer data import.
- Registry or Prometheus target changes.
- Auth token shape changes.
- Destructive database rollback or production data mutation beyond synthetic smoke records approved for this task.

## Acceptance Criteria

- [x] Remote repository is clean before deployment through the clean execution worktree; unrelated dirty files remained untouched in the original worktree.
- [x] Deployment script completes successfully after owner approval; immutable rollout correction was applied and the script was patched for future deploys.
- [x] API and web rollout status is checked for immutable tag `99a4f0c`.
- [x] Valid synthetic ingest and webhook submissions are accepted with 202 responses.
- [x] Invalid key submission is rejected generically with 401.
- [x] Owner-scoped event listing is verified with a synthetic Auth smoke token stored in Vault and synced through Kubernetes Secret key names.
- [x] Anonymous operational API access remains protected for guarded admin and customer routes.
- [x] Strict documentation audit, pre-coding gate, and deployment-readiness gate pass before closure.

## Required Context

- `docs/13_context_packages/CP-TASK-004-task003-production-deployment-and-smoke-validation.md`
- `docs/17_governance/PROJECT_INVARIANTS.md`
- `docs/23_documentation_contracts/SENSITIVE_DATA_POLICY.md`
- `docs/12_validation/VAL-TASK-003-customer-integration-ingest-and-webhook-activation.md`
- `scripts/deploy.sh`

## Validation Task

Validate with deployment evidence, synthetic smoke checks, strict documentation audit, pre-coding gate, deployment-readiness gate, and validation-debt classification for unavailable credentials or external services.

## Required Gates

- Explicit owner approval before deployment.
- Strict documentation audit.
- Pre-coding gate.
- Deployment-readiness gate.
- Validation-debt ledger update for out-of-scope or unavailable external smoke prerequisites.

## Execution Plan Requirement

This task must not be converted into deployment execution until the owner explicitly approves deployment.

## Parallel Planning

TASK-004 can run in parallel only after deployment approval. Deployment runner, smoke validator, and evidence integrator can operate as separate agents if they do not edit the same validation report or gate files concurrently. The coordinator owns final evidence merge and commit order.
