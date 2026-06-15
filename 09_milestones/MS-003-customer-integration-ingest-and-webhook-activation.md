# MS-003: Customer Integration Ingest and Webhook Activation

```yaml
id: MS-003
status: reviewed
owner: Operations Lead
created: 2026-06-15
last_updated: 2026-06-15
completeness_level: complete
upstream:
  - ../08_roadmap/ROADMAP.md
downstream:
  - ../10_features/FEAT-003-customer-integration-ingest-and-webhook-activation.md
related_adrs:
  - ../07_decisions/ADR-001-use-ips-governance-baseline.md
```

## Goal

Activate customer-created integration records so registered customers can send synthetic health ingests and webhook events into AlphaCZ Monitoring without exposing operational dashboard data or making monitoring an identity authority.

## Scope

Create authenticated-by-api-key ingest and webhook endpoints, persist customer integration events or observations, expose owner-scoped event visibility in the customer dashboard, and preserve existing admin-only operational monitoring boundaries.

## Completion Criteria

- Customer integration API keys can authenticate ingest and webhook submissions without storing or logging raw keys.
- Ingested customer health events are associated with the matching customer integration record.
- Registered customers can view recent owner-scoped integration events in the customer dashboard.
- Invalid, revoked, or unknown keys are rejected without revealing whether a customer or integration exists.
- Documentation, graph, validation, and gates record synthetic-only evidence.

## Parallel Execution

Implementation can be split after this milestone is approved:

- Backend ingest contract and persistence: ready after execution plan approval.
- Customer dashboard event visibility: dependency-gated by backend response DTO contract.
- Validation/docs/graph evidence: final integration after backend and UI handoffs.

Shared contracts: ingest event DTOs, customer integration response shape, and event retention fields. Integration owner: coordinator/release agent. Validation owner: integration validator.

## Validation

Validated by `VAL-TASK-003` after TASK-003 implementation, API/web builds, Jest tests, strict documentation audit, pre-coding gate, deployment-readiness gate, and sanitized smoke evidence.
