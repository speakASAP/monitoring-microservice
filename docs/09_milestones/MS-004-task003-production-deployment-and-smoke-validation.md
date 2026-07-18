# MS-004: TASK-003 Production Deployment and Smoke Validation

```yaml
id: MS-004
status: validated
owner: Operations Lead
created: 2026-06-15
last_updated: 2026-06-15
completeness_level: complete
upstream:
  - ../08_roadmap/ROADMAP.md
downstream:
  - ../10_features/FEAT-004-task003-production-deployment-and-smoke-validation.md
related_adrs:
  - ../07_decisions/ADR-001-use-ips-governance-baseline.md
```

## Goal

Deploy the validated TASK-003 customer integration ingest work and collect sanitized live smoke evidence that the public customer ingest paths, owner-scoped event listing, and customer dashboard remain operational after rollout.

## Scope

Prepare and execute an owner-approved production deployment of the already merged TASK-003 changes, then run non-secret smoke checks against public and authenticated paths using synthetic data only.

## Completion Criteria

- Deployment is executed through the repository deployment script after owner approval.
- API and web rollout status is checked without recording secrets or customer identifiers.
- Synthetic ingest and webhook smoke checks prove valid-key acceptance and invalid-key rejection.
- Customer event listing is verified with an Auth-owned test session or marked `[MISSING: approved smoke token]` if unavailable.
- Validation evidence is recorded in mutable TASK-004 artifacts using sanitized summaries only.

## Parallel Execution

TASK-004 can be split after deployment approval:

- Deployment runner: ready after owner approval and clean repo status.
- Smoke validator: dependency-gated by deployed revision and approved synthetic credentials.
- IPS evidence integrator: final integration after deployment and smoke handoffs.

Shared contracts: deployment revision, synthetic integration id/key, Auth test token availability, and smoke evidence format. Integration owner: coordinator/release agent. Validation owner: integration validator.

## Validation

Validated by deployment command result, rollout status checks, sanitized smoke checks, strict documentation audit, pre-coding gate, and deployment-readiness gate for TASK-004.
