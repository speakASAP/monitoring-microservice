# FEAT-002: SaaS Access and Customer Onboarding

Parent subsystem: `05_subsystems/SUB-002-monitoring-dashboard.md`
Upstream milestone: `09_milestones/MS-002-saas-access-and-customer-onboarding.md`

## Goal

Make AlphaCZ Monitoring a customer-facing SaaS entry point while protecting operational monitoring views with Auth-owned identity and monitoring admin RBAC.

## User story

As a potential customer, I can understand pricing and register for AlphaCZ Monitoring from the public page. As a registered customer, I can add my services and view integration connection details. As a monitoring admin, I can access the existing operational dashboard only after my Auth account has monitoring admin rights.

## Acceptance criteria

- Public visitors see landing, pricing, and registration content instead of operational monitoring data.
- Registered Auth users can access a customer dashboard for service integration setup.
- Operational dashboard data is available only to Auth users with monitoring admin rights.
- Customer integration records are scoped to the authenticated user.
- Documentation and validation use synthetic examples and no raw secrets.

## Dependencies

- `04_systems/SYS-001-monitoring-platform.md`
- `05_subsystems/SUB-001-monitoring-api.md`
- `05_subsystems/SUB-002-monitoring-dashboard.md`
- Auth service token validation contract inspected on `alfares`.

## Traceability

- Upstream vision: `01_vision/VISION.md`
- Business case: `02_business_case/BUSINESS_CASE.md`
- Source task: `11_tasks/TASK-002-implement-saas-access-and-customer-onboarding.md`
- Goal impact: `22_goal_impact/GOAL-IMPACT-TASK-002.md`

## Validation

Validation is recorded in `12_validation/VAL-TASK-002-saas-access-and-customer-onboarding.md` and includes API build, web build, unit tests, strict documentation audit, pre-coding gate, and deployment-readiness gate.
