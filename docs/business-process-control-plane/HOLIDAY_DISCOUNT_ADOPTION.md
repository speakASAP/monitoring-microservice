# BPCP Holiday Discount Adoption

Status: service-local adoption contract
Date: 2026-07-02
Service: `monitoring-microservice`
Central contract pack: `statex-ecosystem/docs/business-process-control-plane/`

## Role

Operational monitoring owner for BPCP process health.

## Responsibilities

- Monitor process activation health, adapter failures, validation failures, and kill switch state.
- Alert on active process failures during checkout or order paths.

## Required interfaces

- Metrics for active processes, failed evaluations, paused processes, adapter latency, slot/render failures.
- Alert definitions for holiday discount activation.

## Boundaries

- This service must not become the global owner of BPCP process definitions.
- This service must fail closed on invalid or unknown BPCP process versions.
- This service must keep existing domain ownership and invariants.
- This service must expose or document dry-run behavior before live execution.
- This service must not overwrite existing service contracts without an
  explicit integration owner and validation owner.

## Holiday Discount pilot expectations

- Recognize `holiday-discount-2026` only through versioned BPCP contracts.
- Preserve `processId`, `processVersion`, and `policyId` in every relevant
  decision, event, snapshot, log, or rendered experience.
- Support rollback by respecting BPCP pause and retired states.
- Keep process display and process execution separate where applicable.

## Blockers and unknowns

- [MISSING: monitoring ingestion metric names for BPCP]

## Validation evidence required before implementation is accepted

- Synthetic metrics show active process.
- Alert fires for repeated failed evaluations.
- Kill-switch state is visible.

## Parallel handoff

This adoption doc is safe for a focused service owner to implement in parallel
after the central BPCP schemas are accepted. The service owner must not edit
shared BPCP schemas directly; schema changes go through the BPCP integration
owner.
