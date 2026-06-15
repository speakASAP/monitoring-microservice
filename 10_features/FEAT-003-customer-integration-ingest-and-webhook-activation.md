# FEAT-003: Customer Integration Ingest and Webhook Activation

Parent subsystem: `05_subsystems/SUB-001-monitoring-api.md` and `05_subsystems/SUB-002-monitoring-dashboard.md`
Upstream milestone: `09_milestones/MS-003-customer-integration-ingest-and-webhook-activation.md`

## Goal

Turn customer integration records into usable monitoring inputs by accepting customer health ingests and webhook events through key-authenticated endpoints and showing recent event state in the customer dashboard.

## User story

As a registered customer, I can copy my integration endpoint and one-time API key into my service, submit health or webhook events, and see recent accepted events in my customer dashboard. As a monitoring admin, I keep operational dashboard access protected and separate from customer-submitted data.

## Acceptance criteria

- Customer ingest and webhook endpoints authenticate with hashed integration API keys.
- Raw API keys, Authorization headers, and request secrets are never persisted in plaintext or recorded in IPS evidence.
- Accepted events are tied to the matching customer integration and owner.
- Customer event listing is owner-scoped through Auth validation.
- Invalid or inactive integration keys return a generic unauthorized response.
- Browser API calls remain same-origin through `/api/*`.
- Documentation and tests use synthetic payloads under `example.invalid` only.

## Dependencies

- `04_systems/SYS-001-monitoring-platform.md`
- `05_subsystems/SUB-001-monitoring-api.md`
- `05_subsystems/SUB-002-monitoring-dashboard.md`
- `10_features/FEAT-002-saas-access-and-customer-onboarding.md`
- Existing customer integration entity and key generation behavior from TASK-002.

## Traceability

- Upstream vision: `01_vision/VISION.md`
- Business case: `02_business_case/BUSINESS_CASE.md`
- System: `04_systems/SYS-001-monitoring-platform.md`
- Source task: `11_tasks/TASK-003-customer-integration-ingest-and-webhook-activation.md`
- Goal impact: `22_goal_impact/GOAL-IMPACT-TASK-003.md`

## Validation

Validation must include API build, web build, unit tests for key verification and owner scoping, strict documentation audit, pre-coding gate, and deployment-readiness gate.
