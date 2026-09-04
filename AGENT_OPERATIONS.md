# Agent Operations

## Roles

Readiness scanners classify work; worker agents implement one bounded goal; worker monitors identify conflicts; integration validators separate current-task failures from known debt.

## Before Work

Confirm traceability, approved intent, relevant invariants, allowed files, integration contracts, sensitive-data handling, and validation commands before implementation.

## Parallel Work

Do not concurrently modify the registry, deployment files, public contracts, or state artifacts without one integration owner and a documented merge order.

## Validation Debt

Record only out-of-scope known failures in `docs/orchestrator/VALIDATION_DEBT.md`. Debt never excuses a failure in active-task files or acceptance criteria.

## Handoff

Record completed work, validation evidence, blockers, changed contracts, and next owner action in `TASKS.md` and `STATE.json` at task boundaries.

## Project-Specific Operations

`src/config/ecosystem-services.ts` is the only registry; change it and rebuild through the approved deployment flow.
