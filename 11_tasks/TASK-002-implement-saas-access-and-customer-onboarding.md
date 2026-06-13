# TASK-002: Implement SaaS Access and Customer Onboarding

```yaml
id: TASK-002
status: reviewed
owner: Operations Lead
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../10_features/FEAT-002-saas-access-and-customer-onboarding.md
goal_impact:
  - ../22_goal_impact/GOAL-IMPACT-TASK-002.md
execution_plan:
  - ../21_execution_plans/EP-TASK-002-saas-access-and-customer-onboarding.md
```

## Objective

Implement the first SaaS access layer for AlphaCZ Monitoring: public landing with pricing and registration, admin-only operational dashboard access, and a registered customer dashboard for service integration setup.

## Upstream Links

- `10_features/FEAT-002-saas-access-and-customer-onboarding.md`
- `04_systems/SYS-001-monitoring-platform.md`
- `05_subsystems/SUB-001-monitoring-api.md`
- `05_subsystems/SUB-002-monitoring-dashboard.md`

## Goal Impact

This task changes monitoring from an open operational page into a controlled SaaS surface. It supports customer acquisition, preserves operational dashboard value for admins, and adds the first customer self-service integration workflow.

Goal impact record: `22_goal_impact/GOAL-IMPACT-TASK-002.md`.

## Project Invariant Impact

- Registry source invariant: no registry file or Prometheus target changes.
- Same-origin dashboard API invariant: browser calls continue through same-origin API routes.
- Sensitive data invariant: synthetic examples only; no raw token or customer data in docs or reports.
- Runtime source scope invariant: source edits are limited to landing, auth enforcement, customer dashboard, and customer integration API.

## Sensitive-Data Classification

Classification: synthetic

Examples use placeholder customer services and `example.invalid` domains. Runtime bearer tokens and generated integration keys are not written into documentation, reports, or tests.

## Contract/Schema Impact

Adds monitoring-owned customer integration persistence and customer integration API behavior. Consumes Auth server-side token validation and role claims. Does not change Auth token shape.

## Replay/Determinism Impact

No replay engine impact. Validation is deterministic through builds, unit tests, documentation audit, and gate commands. Customer records are owner-scoped by Auth user id at request time.

## Scope

- Public landing page with AlphaCZ Monitoring offer, pricing, and registration CTA.
- Auth callback handling for browser token handoff.
- Admin guard around operational monitoring API endpoints and admin dashboard UI.
- Customer dashboard for adding, listing, rotating keys for, and deleting integration records.
- Customer integration entity, service, controller, and migration SQL.
- IPS documentation, graph, validation, and prompt artifacts.

## Non-Goals

- Payment collection or billing provider integration.
- Creating user credentials in monitoring.
- Replacing Grafana, Prometheus, or Alertmanager.
- Real customer onboarding data or production screenshots in artifacts.

## Acceptance Criteria

- [x] Public landing page no longer opens operational dashboard as the primary anonymous action.
- [x] Operational API endpoints used by the dashboard require monitoring admin role validation.
- [x] Customer dashboard requires an Auth-validated registered user.
- [x] Customer integration records are filtered by authenticated owner.
- [x] Builds and tests pass before closure.
- [x] Final IPS gates pass after validation report update.

## Required Context

- `13_context_packages/CP-TASK-002-saas-access-and-customer-onboarding.md`
- `17_governance/PROJECT_INVARIANTS.md`
- `23_documentation_contracts/SENSITIVE_DATA_POLICY.md`
- Auth service contract inspected from the remote Auth repository.

## Validation Task

Validate with API build, web build, unit tests, strict doc audit, pre-coding gate, deployment-readiness gate, and source review for no raw tokens or real customer data.

## Required Gates

- Pre-coding gate.
- Strict documentation audit.
- Deployment-readiness gate.

## Execution Plan Requirement

This task must not be converted into a coding prompt until an approved execution plan exists.
