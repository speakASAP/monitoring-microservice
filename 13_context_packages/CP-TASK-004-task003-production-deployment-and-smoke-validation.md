# CP-TASK-004: TASK-003 Production Deployment and Smoke Validation

## Target task

TASK-004: `11_tasks/TASK-004-task003-production-deployment-and-smoke-validation.md`

## Upstream traceability

- `01_vision/VISION.md`
- `04_systems/SYS-001-monitoring-platform.md`
- `05_subsystems/SUB-001-monitoring-api.md`
- `05_subsystems/SUB-002-monitoring-dashboard.md`
- `05_subsystems/SUB-003-observability-stack.md`
- `10_features/FEAT-003-customer-integration-ingest-and-webhook-activation.md`
- `10_features/FEAT-004-task003-production-deployment-and-smoke-validation.md`
- `12_validation/VAL-TASK-003-customer-integration-ingest-and-webhook-activation.md`
- `22_goal_impact/GOAL-IMPACT-TASK-004.md`

## Included documents

- `17_governance/PROJECT_INVARIANTS.md`
- `23_documentation_contracts/SENSITIVE_DATA_POLICY.md`
- `23_documentation_contracts/OPERATIONAL_GATE_STANDARD.md`
- `12_validation/VALIDATION_PYRAMID.md`
- `scripts/deploy.sh`

## Excluded documents

- Protected vision and constitution edits are excluded.
- Raw keys, Auth tokens, Authorization headers, production customer payloads, and production screenshots are excluded.
- Registry and Prometheus target changes are excluded.

## Constraints

- Do not deploy without explicit owner approval.
- Use synthetic payloads and masked evidence only.
- Do not commit generated build artifacts or smoke secrets.
- Treat missing smoke credentials as `missing approved smoke Auth token`, not as invented evidence.
- Keep source changes out of scope unless a new implementation task is approved.

## Agent prompt

Execute TASK-004 only after deployment approval. Confirm clean remote repo state, deploy through `./scripts/deploy.sh`, run sanitized smoke checks for TASK-003 customer ingest behavior, record evidence without secrets, and run IPS audit/gates before closure.

## Validation instructions

Run deployment, rollout checks, synthetic smoke checks, strict documentation audit, pre-coding gate, and deployment-readiness gate. Update validation debt only for failures proven out of scope for TASK-004.
