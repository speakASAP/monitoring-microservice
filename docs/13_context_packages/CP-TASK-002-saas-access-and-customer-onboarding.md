# CP-TASK-002: SaaS Access and Customer Onboarding

## Target task

TASK-002: `docs/11_tasks/TASK-002-implement-saas-access-and-customer-onboarding.md`

## Upstream traceability

- `docs/01_vision/VISION.md`
- `docs/02_business_case/BUSINESS_CASE.md`
- `docs/04_systems/SYS-001-monitoring-platform.md`
- `docs/05_subsystems/SUB-001-monitoring-api.md`
- `docs/05_subsystems/SUB-002-monitoring-dashboard.md`
- `docs/10_features/FEAT-002-saas-access-and-customer-onboarding.md`
- `docs/22_goal_impact/GOAL-IMPACT-TASK-002.md`

## Included documents

- `docs/17_governance/PROJECT_INVARIANTS.md`
- `docs/23_documentation_contracts/SENSITIVE_DATA_POLICY.md`
- `docs/23_documentation_contracts/OPERATIONAL_GATE_STANDARD.md`
- Auth service hosted entry point and token validation contract inspected from the remote Auth repository.

## Excluded documents

- Protected vision and constitution edits are excluded.
- Real customer data, production tokens, raw keys, and production screenshots are excluded.
- Payment provider documentation is excluded because billing collection is out of scope.

## Constraints

- Monitoring must not become the credential authority.
- Customer examples must be synthetic.
- Browser API calls must remain same-origin.
- Operational dashboard design should be preserved except for required authentication states.
- Customer integration records must be owner-scoped.

## Agent prompt

Implement TASK-002 in monitoring-microservice. Preserve existing admin dashboard design, replace public home with AlphaCZ Monitoring landing and pricing, enforce Auth-backed monitoring admin role checks for operational dashboard APIs, add registered-customer dashboard and owner-scoped customer integration APIs, and validate with builds, tests, audit, and gates.

## Validation instructions

Run API build, web build, unit tests, strict documentation audit, pre-coding gate, deployment-readiness gate, and source review for no raw secrets or real customer identifiers.
