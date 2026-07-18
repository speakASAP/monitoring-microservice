# CP-TASK-003: Customer Integration Ingest and Webhook Activation

## Target task

TASK-003: `docs/11_tasks/TASK-003-customer-integration-ingest-and-webhook-activation.md`

## Upstream traceability

- `docs/01_vision/VISION.md`
- `docs/02_business_case/BUSINESS_CASE.md`
- `docs/04_systems/SYS-001-monitoring-platform.md`
- `docs/05_subsystems/SUB-001-monitoring-api.md`
- `docs/05_subsystems/SUB-002-monitoring-dashboard.md`
- `docs/09_milestones/MS-003-customer-integration-ingest-and-webhook-activation.md`
- `docs/10_features/FEAT-003-customer-integration-ingest-and-webhook-activation.md`
- `docs/22_goal_impact/GOAL-IMPACT-TASK-003.md`

## Included documents

- `docs/17_governance/PROJECT_INVARIANTS.md`
- `docs/23_documentation_contracts/SENSITIVE_DATA_POLICY.md`
- `docs/23_documentation_contracts/OPERATIONAL_GATE_STANDARD.md`
- `docs/12_validation/VALIDATION_PYRAMID.md`
- `docs/10_features/FEAT-002-saas-access-and-customer-onboarding.md`
- `docs/11_tasks/TASK-002-implement-saas-access-and-customer-onboarding.md`

## Existing implementation context

- Customer integration records live under `src/customer-integrations/`.
- Integration keys are generated once, stored as hashes, and exposed only as one-time plaintext responses on create or rotate.
- Customer connection details currently expose `ingestEndpoint` and `webhookEndpoint` using `apiKeyId` in the path.
- Customer dashboard uses same-origin API helpers in `web/lib/api.ts`.
- Admin operational APIs are protected by monitoring admin guards from TASK-002.

## Excluded documents

- Protected vision and constitution edits are excluded.
- Real customer payloads, production tokens, raw keys, Authorization headers, and production screenshots are excluded.
- Payment provider documentation is excluded because billing is out of scope.
- Registry and Prometheus target changes are excluded.

## Constraints

- Monitoring must not become an Auth or credential authority.
- Raw API keys must never be stored, logged, committed, or included in reports.
- Invalid key responses must not reveal customer or integration existence.
- Customer event listing must be owner-scoped.
- Browser calls must remain same-origin.
- Examples must use `example.invalid` and synthetic identifiers only.

## Agent prompt

Implement TASK-003 in monitoring-microservice after the execution plan is approved. Add key-authenticated customer ingest/webhook endpoints, persist sanitized customer integration events, expose owner-scoped recent events to authenticated customers, update the customer dashboard, and validate with builds, focused tests, audit, and IPS gates.

## Validation instructions

Run API build, web build, unit tests, strict documentation audit, pre-coding gate, deployment-readiness gate, and source review for raw secret handling. Record only sanitized evidence in the validation report.
