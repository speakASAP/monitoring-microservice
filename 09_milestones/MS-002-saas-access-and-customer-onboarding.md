# MS-002: SaaS Access and Customer Onboarding

```yaml
id: MS-002
status: reviewed
owner: Operations Lead
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../08_roadmap/ROADMAP.md
downstream:
  - ../10_features/FEAT-002-saas-access-and-customer-onboarding.md
related_adrs:
  - ../07_decisions/ADR-001-use-ips-governance-baseline.md
```

## Goal

Launch the first customer-facing SaaS access layer for AlphaCZ Monitoring while preserving protected operational monitoring access for admins.

## Scope

Create the public acquisition surface, Auth-backed customer onboarding flow, customer integration setup workflow, and admin-only operational monitoring boundary implemented by TASK-002.

## Completion Criteria

- Public visitors see landing, pricing, and registration content instead of operational monitoring data.
- Registered Auth users can access a customer dashboard for service integration setup.
- Operational dashboard data is available only to Auth users with monitoring admin rights.
- Customer integration records are scoped to the authenticated user.
- TASK-002 validation evidence records builds, tests, documentation audit, and operational gates.

## Validation

Validated by `VAL-TASK-002`.
