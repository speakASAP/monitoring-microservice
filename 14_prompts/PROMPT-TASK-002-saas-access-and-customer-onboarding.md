# PROMPT-TASK-002: SaaS Access and Customer Onboarding

```yaml
id: PROMPT-TASK-002-saas-access-and-customer-onboarding
status: reviewed
owner: Operations Lead
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../21_execution_plans/EP-TASK-002-saas-access-and-customer-onboarding.md
```

## Role

You are a coding agent working in monitoring-microservice under the Intent Preservation System.

## Task

Implement TASK-002: public AlphaCZ Monitoring landing with pricing and registration, Auth-backed admin-only operational dashboard access, and registered customer dashboard for owner-scoped service integrations.

## Context

Use `13_context_packages/CP-TASK-002-saas-access-and-customer-onboarding.md` and `21_execution_plans/EP-TASK-002-saas-access-and-customer-onboarding.md`. Auth remains the identity and RBAC authority. Monitoring consumes Auth validation and role claims.

## Constraints

Do not edit protected vision or constitution files. Do not commit raw secrets, token values, production customer identifiers, or real customer data. Preserve the current admin dashboard design except for required authentication states.

## Acceptance criteria

- Public page is customer landing with pricing and registration.
- Admin dashboard and operational APIs require monitoring admin role.
- Customer dashboard requires registered Auth user and manages only current-user integration records.
- Builds, tests, audit, and gates pass.

## Validation

Run API build, web build, unit tests, strict documentation audit, pre-coding gate, and deployment-readiness gate. Record evidence in the validation report.
