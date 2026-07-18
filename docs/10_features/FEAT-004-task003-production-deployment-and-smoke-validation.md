# FEAT-004: TASK-003 Production Deployment and Smoke Validation

Parent subsystem: `docs/05_subsystems/SUB-003-observability-stack.md` and `docs/05_subsystems/SUB-001-monitoring-api.md`
Upstream milestone: `docs/09_milestones/MS-004-task003-production-deployment-and-smoke-validation.md`

## Goal

Safely roll out TASK-003 customer integration ingest to production and prove the deployed behavior with synthetic smoke evidence.

## User story

As an operator, I can deploy the customer ingest feature through the standard monitoring deployment path and verify that customer integration endpoints work in production without exposing real customer data, raw keys, tokens, or operational secrets.

## Acceptance criteria

- Deployment uses `./scripts/deploy.sh` from the remote monitoring repository after explicit approval.
- Smoke checks use synthetic integration records and masked or transient credentials only.
- Valid synthetic key submission is accepted for ingest or webhook endpoints.
- Invalid key submission is rejected generically.
- Authenticated customer event listing is verified when an approved smoke Auth token is available.
- Operational admin boundaries from TASK-002 remain protected.
- Evidence is recorded without raw Authorization headers, raw API keys, customer identifiers, or production payloads.

## Dependencies

- `docs/10_features/FEAT-003-customer-integration-ingest-and-webhook-activation.md`
- `docs/12_validation/VAL-TASK-003-customer-integration-ingest-and-webhook-activation.md`
- `docs/16_operations/LOCAL_WORKFLOW.md`
- Repository deployment script `scripts/deploy.sh`.

## Traceability

- Upstream vision: `docs/01_vision/VISION.md`
- System: `docs/04_systems/SYS-001-monitoring-platform.md`
- Source task: `docs/11_tasks/TASK-004-task003-production-deployment-and-smoke-validation.md`
- Goal impact: `docs/22_goal_impact/GOAL-IMPACT-TASK-004.md`

## Validation

Validation requires deployment evidence, sanitized smoke results, strict documentation audit, pre-coding gate, and deployment-readiness gate.
