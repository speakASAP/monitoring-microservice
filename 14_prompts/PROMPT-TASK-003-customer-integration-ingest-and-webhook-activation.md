# PROMPT-TASK-003: Customer Integration Ingest and Webhook Activation

```yaml
id: PROMPT-TASK-003-customer-integration-ingest-and-webhook-activation
status: used
owner: Operations Lead
created: 2026-06-15
last_updated: 2026-06-15
completeness_level: complete
upstream:
  - ../21_execution_plans/EP-TASK-003-customer-integration-ingest-and-webhook-activation.md
```

## Role

You are a coding agent working in monitoring-microservice under the Intent Preservation System.

## Task

Implement TASK-003 after owner approval: key-authenticated customer ingest and webhook endpoints, sanitized customer integration event persistence, owner-scoped event listing, customer dashboard recent-event visibility, and validation evidence.

## Context

Use `13_context_packages/CP-TASK-003-customer-integration-ingest-and-webhook-activation.md` and `21_execution_plans/EP-TASK-003-customer-integration-ingest-and-webhook-activation.md`. TASK-002 already created Auth-backed customer integration records, one-time key display, hashed key storage, and same-origin customer dashboard API helpers.

## Constraints

Do not edit protected vision or constitution files. Do not edit registry or Prometheus target files. Do not change Auth token shape, create monitoring-owned identities, add billing, store raw API keys, log Authorization headers, or include real customer data in tests, docs, prompts, reports, or screenshots.

## Acceptance criteria

- Valid synthetic integration keys submit accepted events.
- Invalid, unknown, missing, or inactive keys are rejected generically.
- Events are associated with the correct integration and owner.
- Customer event listing is owner-scoped.
- Dashboard shows recent event state without exposing raw secrets.
- Build, tests, strict audit, pre-coding gate, and deployment-readiness gate pass.

## Validation

Run API build, web build, focused unit tests, strict documentation audit, pre-coding gate, and deployment-readiness gate. Record sanitized evidence in the validation report after implementation.
