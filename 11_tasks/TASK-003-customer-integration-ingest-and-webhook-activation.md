# TASK-003: Customer Integration Ingest and Webhook Activation

```yaml
id: TASK-003
status: completed
owner: Operations Lead
created: 2026-06-15
last_updated: 2026-06-15
completeness_level: validated
upstream:
  - ../10_features/FEAT-003-customer-integration-ingest-and-webhook-activation.md
goal_impact:
  - ../22_goal_impact/GOAL-IMPACT-TASK-003.md
execution_plan:
  - ../21_execution_plans/EP-TASK-003-customer-integration-ingest-and-webhook-activation.md
```

## Objective

Implement customer-facing ingest and webhook activation for AlphaCZ Monitoring integrations: key-authenticated event submission, owner-scoped event persistence, customer dashboard event visibility, and validation evidence that no raw secrets or real customer data are stored in artifacts.

## Upstream Links

- `10_features/FEAT-003-customer-integration-ingest-and-webhook-activation.md`
- `09_milestones/MS-003-customer-integration-ingest-and-webhook-activation.md`
- `04_systems/SYS-001-monitoring-platform.md`
- `05_subsystems/SUB-001-monitoring-api.md`
- `05_subsystems/SUB-002-monitoring-dashboard.md`
- `10_features/FEAT-002-saas-access-and-customer-onboarding.md`

## Goal Impact

This task makes customer integrations operational by accepting synthetic health and webhook events from customer services. It strengthens SaaS value while preserving Auth ownership, owner scoping, and admin-only operational monitoring.

Goal impact record: `22_goal_impact/GOAL-IMPACT-TASK-003.md`.

## Project Invariant Impact

- Registry source invariant: no change to `src/config/ecosystem-services.ts` unless a later approved task explicitly updates registry behavior.
- Prometheus alignment invariant: no Prometheus target changes in this task.
- Same-origin dashboard API invariant: customer dashboard event listing must use same-origin `/api/*` browser calls.
- Sensitive data invariant: examples and tests use synthetic payloads only; raw keys and Authorization headers must not be persisted or recorded.
- Runtime source scope invariant: source edits are limited to customer integration ingest, event persistence, customer dashboard event visibility, and supporting tests/docs.

## Sensitive-Data Classification

Classification: synthetic

Tests, examples, and reports must use artificial integration names, artificial key placeholders, and `example.invalid` URLs. Runtime implementation must hash incoming keys for comparison and must not log raw key values or request authorization headers.

## Contract/Schema Impact

Adds customer ingest/webhook API behavior and likely adds a monitoring-owned event persistence schema for customer integration events. The task may add DTOs for synthetic health and webhook payloads. It must not change Auth token shape or customer identity ownership.

## Replay/Determinism Impact

Event persistence and key verification must be deterministic in unit tests. Accepted event writes should be idempotency-aware where a client-provided synthetic event id is present; if idempotency is deferred, the execution plan must document that as a non-goal and validation risk.

## Scope

- Key-authenticated ingest endpoint for customer integration health/event submissions.
- Key-authenticated customer webhook endpoint using existing integration key ids in connection details.
- Persistence for recent customer integration events or observations.
- Owner-scoped event listing for authenticated customers.
- Customer dashboard display of recent events and last accepted state.
- Unit tests for key verification, invalid key behavior, owner scoping, and response sanitization.
- IPS documentation, graph, prompt, and validation report updates.

## Non-Goals

- Billing, subscriptions, or payment provider integration.
- Real customer data import or production payload captures.
- Registry or Prometheus target changes.
- Replacing Alertmanager, Grafana, or existing operational alert workflows.
- Monitoring-owned user credentials or Auth token redesign.
- Public unauthenticated event listing.

## Acceptance Criteria

- [x] Valid integration keys can submit synthetic health ingest events and receive a sanitized success response.
- [x] Invalid, unknown, missing, or inactive keys are rejected with a generic unauthorized response.
- [x] Raw API keys and Authorization headers are not persisted, logged, or included in validation evidence.
- [x] Accepted events are associated with the correct customer integration and owner.
- [x] Authenticated customers can list only their own recent integration events.
- [x] Customer dashboard displays recent event state without exposing raw secrets.
- [x] API build, web build, unit tests, strict doc audit, pre-coding gate, and deployment-readiness gate pass before closure.

## Required Context

- `13_context_packages/CP-TASK-003-customer-integration-ingest-and-webhook-activation.md`
- `17_governance/PROJECT_INVARIANTS.md`
- `23_documentation_contracts/SENSITIVE_DATA_POLICY.md`
- `10_features/FEAT-002-saas-access-and-customer-onboarding.md`
- Existing customer integration API under `src/customer-integrations/`.

## Validation Task

Validate with API build, web build, focused unit tests for ingest/key behavior, strict documentation audit, pre-coding gate, deployment-readiness gate, and sanitized source review for secret handling.

## Required Gates

- Pre-coding gate.
- Strict documentation audit.
- Deployment-readiness gate.
- Current-task validation debt classification if any command fails outside TASK-003 scope.

## Execution Plan Requirement

This task must not be converted into a coding prompt or implementation thread until an approved execution plan exists.

## Parallel Planning

TASK-003 implementation can run in parallel after plan approval using independent backend, frontend, test, and documentation workstreams. Shared contracts are the ingest DTOs, event entity fields, customer dashboard event response shape, and API helper names. The coordinator owns merge order and must merge backend contract before frontend event display.
