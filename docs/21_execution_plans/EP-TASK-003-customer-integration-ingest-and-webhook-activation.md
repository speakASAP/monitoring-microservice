# EP-TASK-003: Customer Integration Ingest and Webhook Activation

```yaml
id: EP-TASK-003
status: validated
source_task: ../11_tasks/TASK-003-customer-integration-ingest-and-webhook-activation.md
owner: Operations Lead
created: 2026-06-15
last_updated: 2026-06-15
completeness_level: validated
```

## Metadata

Owner: Operations Lead. Status: draft. Source task: `docs/11_tasks/TASK-003-customer-integration-ingest-and-webhook-activation.md`. Lifecycle state: reviewed planning, awaiting owner approval for implementation. Execution mode: parallel-ready after approval, with backend contract merged before dependent frontend work.

## Upstream Traceability

```yaml
constitution: docs/00_constitution/CONSTITUTION.md
vision: docs/01_vision/VISION.md
business_case: docs/02_business_case/BUSINESS_CASE.md
system: docs/04_systems/SYS-001-monitoring-platform.md
subsystems:
  - docs/05_subsystems/SUB-001-monitoring-api.md
  - docs/05_subsystems/SUB-002-monitoring-dashboard.md
milestone: docs/09_milestones/MS-003-customer-integration-ingest-and-webhook-activation.md
feature: docs/10_features/FEAT-003-customer-integration-ingest-and-webhook-activation.md
goal_impact: docs/22_goal_impact/GOAL-IMPACT-TASK-003.md
task: docs/11_tasks/TASK-003-customer-integration-ingest-and-webhook-activation.md
context_package: docs/13_context_packages/CP-TASK-003-customer-integration-ingest-and-webhook-activation.md
```

## Goal Impact

The plan activates the SaaS onboarding workflow by giving customers a real monitored input path. It contributes to the monitoring vision by ingesting service health signals while keeping operational monitoring, Auth ownership, and sensitive-data boundaries intact.

## Project Invariants

- Registry source invariant is preserved by not editing `src/config/ecosystem-services.ts`.
- Prometheus alignment invariant is preserved by not editing Prometheus target configuration.
- Same-origin browser API invariant is preserved through `web/lib/api.ts` helper calls to `/api/*` paths.
- Sensitive data invariant is preserved by hashing key material, avoiding raw key logs, and keeping validation evidence synthetic.
- Runtime source scope invariant is preserved by limiting edits to customer integration ingest, customer event persistence, customer dashboard display, and related docs/tests.
- Parallel execution invariant: each workstream owns bounded files and shared contracts merge in the documented order.

## Sensitive-Data Handling

Classification: synthetic. Tests and docs must use artificial integration names, artificial event ids, placeholder key strings, and `example.invalid` URLs. Raw API keys, Authorization headers, request secrets, and production payloads must not be logged, persisted, or copied into validation evidence.

## Contract Validation Plan

TASK-003 adds contracts for customer event submission and owner-scoped event listing:

- `POST /api/ingest/:apiKeyId` accepts a synthetic health/event payload with key authentication.
- `POST /api/customer/webhooks/:apiKeyId` accepts a synthetic webhook event with key authentication.
- `GET /api/customer/integrations/:id/events` lists recent events only for the authenticated owner.

Final names and DTO fields are owned by Goal A. Goal B and Goal C must consume the handoff contract rather than inventing alternate shapes.

## Replay/Determinism Plan

Unit tests must make key hashing and event association deterministic with fixed synthetic keys. If event idempotency is implemented, tests must prove duplicate synthetic event ids do not create duplicate records. If idempotency is deferred, the validation report must record it as accepted follow-up risk.

## Scope

Implement key-authenticated ingest/webhook submission, customer integration event persistence, owner-scoped customer event listing, customer dashboard recent-event visibility, tests, and IPS validation evidence.

## Non-Goals

Billing, production customer payload capture, registry updates, Prometheus target updates, Auth token changes, Grafana replacement, Alertmanager replacement, public event listing, and monitoring-owned user credentials are out of scope.

## Parallel Execution Model

Implementation is split into bounded workstreams that can run in separate Codex sessions after this draft is reviewed or approved. Do not start implementation until the owner explicitly approves TASK-003 execution.

Coordination rules:

- Goal A owns backend public contract and must merge before Goal B consumes API fields.
- Goal C can write backend tests after Goal A publishes DTO and service method names.
- Goal D owns IPS docs and graph updates, then final validation after implementation handoffs.
- Shared files require coordinator merge order; no two workers should edit `src/app.module.ts`, `web/lib/api.ts`, or `graph/project_graph.yaml` at the same time.
- Final integration validates the combined tree only after all workstreams are merged.

## Parallel Workstreams

### Goal A: Backend Ingest Contract and Persistence

Status: dependency-gated by execution plan approval. Owner role: backend/API agent.

Objective: add key-authenticated customer ingest and webhook endpoints, event persistence, and owner-scoped event retrieval.

Allowed files:

- Existing `src/customer-integrations/` module files and new event, ingest, DTO, and service artifacts created inside that module.
- Existing `src/database/migrations/001_init.sql` for additive table creation.

Forbidden files:

- `src/config/ecosystem-services.ts`
- `k8s/prometheus/configmap-config.yaml`
- Auth service repositories or Auth token shape
- payment or billing files

Dependencies and blockers:

- Blocking: unclear key transport contract. Default to `Authorization: Bearer <key>` and document support for synthetic `X-Monitoring-Key` only if implemented.
- Blocking: event table shape cannot preserve owner scoping without integration owner id.
- Requires coordinator decision: storing full webhook payloads. Default to sanitized JSON summary and status fields only.

Expected output:

- Stable endpoint paths and DTO contract.
- Hashed key verification by key id and raw key candidate.
- Generic unauthorized response for invalid keys.
- Event rows associated with integration id and owner user id.

Validation evidence:

- `npm run build`
- focused Jest tests or service tests for key verification and owner scoping
- source review confirming no raw key logging or persistence

Handoff notes:

- Endpoint paths, request fields, response fields, error behavior, and any idempotency decision.

### Goal B: Customer Dashboard Event Visibility

Status: dependency-gated by Goal A response contract. Owner role: frontend/product workflow agent.

Objective: show recent accepted events for each customer integration without exposing raw secrets.

Allowed files:

- `web/app/customer/page.tsx`
- `web/lib/api.ts`

Forbidden files:

- `web/app/dashboard/page.tsx` except if coordinator approves a shared auth fix
- Auth token storage behavior
- operational dashboard layout beyond required links

Dependencies and blockers:

- Blocking: Goal A does not publish response DTO fields.
- Blocking: event listing endpoint does not support owner-scoped Auth requests.
- Non-blocking: exact empty-state copy is missing; use synthetic generic wording.

Expected output:

- Customer dashboard loads recent events through same-origin helper calls.
- Event state is visible per integration with sanitized fields only.
- Loading, empty, and error states remain usable on desktop and mobile.

Validation evidence:

- `cd web && npm run build`
- source review confirming same-origin `/api/*` calls and no raw key rendering

Handoff notes:

- UI states, API helper names, and any deferred UX gaps.

### Goal C: Focused Tests and Secret-Handling Review

Status: dependency-gated by Goal A implementation. Owner role: backend validation agent.

Objective: add or run focused validation for key authentication, invalid key behavior, owner scoping, sanitization, and deterministic event persistence.

Allowed files:

- Focused customer integration test files inside the existing `src/customer-integrations/` module.
- Synthetic test fixtures inside that module if needed.
- `docs/orchestrator/VALIDATION_DEBT.md` only if an out-of-scope failure is confirmed

Forbidden files:

- production secrets, `.env`, real payload captures, or generated build output

Dependencies and blockers:

- Blocking: no testable key verification function or service method exists after Goal A.
- Blocking: repository test harness cannot instantiate the service without unsafe external dependencies; record specific blocker and use source-level validation only with coordinator approval.

Expected output:

- Deterministic unit tests or documented source-validation substitute.
- Current-task failures treated as blockers.
- Out-of-scope failures recorded only in validation debt ledger.

Validation evidence:

- `npm test -- --runInBand`
- `npm run build`
- sanitized summary of any failures

Handoff notes:

- Tests added, cases covered, debt entries if any, residual risk.

### Goal D: IPS Documentation, Graph, and Final Validation

Status: final integration. Owner role: IPS/integration validator.

Objective: update task prompt and validation report, keep graph traceability complete, run final gates, and prepare deployment-readiness evidence.

Allowed files:

- TASK-003 validation report under `docs/12_validation/` after implementation.
- `docs/14_prompts/PROMPT-TASK-003-customer-integration-ingest-and-webhook-activation.md`
- `graph/project_graph.yaml`
- mutable TASK-003 docs if implementation evidence changes scope or validation status
- `reports/validation/*.json`

Forbidden files:

- `docs/00_constitution/CONSTITUTION.md`
- `docs/01_vision/VISION.md` unless a human explicitly approves vision change
- runtime source files except tiny documentation-reference corrections approved by coordinator

Dependencies and blockers:

- Blocking: missing implementation handoff from Goal A, B, or C.
- Blocking: strict doc audit or IPS gate failure without remediation.
- Blocking: detected raw token, key, customer identifier, or production payload in artifacts.

Expected output:

- Final validation report with sanitized evidence.
- Graph links for MS-003, FEAT-003, TASK-003, EP, CP, prompt, goal impact, and validation.
- Deployment-readiness status and next action.

Validation evidence:

- `python3 scripts/strict_doc_audit.py --format markdown --fail-on-issues`
- `python3 scripts/pre_coding_gate.py --root .`
- `python3 scripts/deployment_readiness_gate.py --root . --target TASK-003`

Handoff notes:

- Final status, deviations, validation commands, deployment recommendation, rollback notes.

## Shared File Merge Order

1. Merge Goal A backend contract and module wiring first.
2. Merge Goal C tests after Goal A exposes stable service methods.
3. Merge Goal B frontend helper/UI after Goal A endpoint response contract is stable.
4. Merge Goal D documentation and graph after Goals A-C handoffs are available.
5. Run final validation and deployment-readiness gates after all workstreams are merged.

## Files to Inspect

- `src/customer-integrations/customer-integration.entity.ts`
- `src/customer-integrations/customer-integrations.service.ts`
- `src/customer-integrations/customer-integrations.controller.ts`
- `src/customer-integrations/customer-integrations.module.ts`
- `src/database/migrations/001_init.sql`
- `web/app/customer/page.tsx`
- `web/lib/api.ts`
- `docs/17_governance/PROJECT_INVARIANTS.md`
- `docs/23_documentation_contracts/SENSITIVE_DATA_POLICY.md`

## Files to Create

- Customer integration event entity, ingest controller, events controller, events service, event DTOs, and focused tests inside existing source directories.
- TASK-003 validation report under `docs/12_validation/` after implementation.

## Files to Modify

- `src/customer-integrations/customer-integrations.module.ts`
- `src/database/migrations/001_init.sql`
- `web/app/customer/page.tsx`
- `web/lib/api.ts`
- `docs/14_prompts/PROMPT-TASK-003-customer-integration-ingest-and-webhook-activation.md`
- `graph/project_graph.yaml`
- IPS gate reports under `reports/validation/`

## Files That Must Not Be Modified

- `docs/00_constitution/CONSTITUTION.md`
- `docs/01_vision/VISION.md`
- `src/config/ecosystem-services.ts`
- `k8s/prometheus/configmap-config.yaml`
- Auth service repositories
- payment or billing integration files

## Implementation Steps

1. Confirm owner approval to move EP-TASK-003 from draft to reviewed or approved.
2. Implement Goal A backend contract and persistence with sanitized key verification.
3. Implement Goal C focused tests for key verification, invalid key behavior, owner scoping, and sanitization.
4. Implement Goal B customer dashboard event visibility against the Goal A DTO handoff.
5. Update Goal D prompt, graph, validation report, and gate evidence.
6. Run final build, test, audit, and gate commands.
7. Decide deployment readiness and record rollback notes.

## Test Plan

- Unit test valid key authentication with a fixed synthetic key and hash.
- Unit test invalid, missing, inactive, and unknown key rejection with generic errors.
- Unit test event association with integration id and owner user id.
- Unit test owner-scoped event listing rejects cross-owner access.
- Build-test the Next.js customer dashboard event display.

## Validation Plan

- API build: `npm run build`.
- API tests: `npm test -- --runInBand`.
- Web build: `cd web && npm run build`.
- Strict documentation audit: `python3 scripts/strict_doc_audit.py --format markdown --fail-on-issues`.
- Pre-coding gate: `python3 scripts/pre_coding_gate.py --root .`.
- Deployment-readiness gate: `python3 scripts/deployment_readiness_gate.py --root . --target TASK-003`.
- Source review for raw key logging, plaintext key persistence, and owner-scoped queries.

## Gate Commands

```bash
python3 scripts/strict_doc_audit.py --format markdown --fail-on-issues
python3 scripts/pre_coding_gate.py --root .
python3 scripts/deployment_readiness_gate.py --root . --target TASK-003
```

## Documentation Updates

- TASK-003 validation report under `docs/12_validation/` after implementation.
- `docs/14_prompts/PROMPT-TASK-003-customer-integration-ingest-and-webhook-activation.md`
- `graph/project_graph.yaml`
- Mutable TASK-003 planning docs if implementation scope changes.

## Rollback Plan

Revert TASK-003 source and documentation commits. If a database table is added, preserve data by default and disable endpoints first; destructive schema rollback requires explicit owner approval. If deployed, redeploy the previous known-good image through the existing deployment workflow.

## Agent Handoff Prompt

You are a coding agent working in monitoring-microservice under the Intent Preservation System. Implement only the approved TASK-003 workstream assigned to you. Read `docs/13_context_packages/CP-TASK-003-customer-integration-ingest-and-webhook-activation.md`, this execution plan, `docs/17_governance/PROJECT_INVARIANTS.md`, and `docs/23_documentation_contracts/SENSITIVE_DATA_POLICY.md`. Stay within the allowed files for your workstream, do not log or persist raw keys, use synthetic test payloads only, and return files changed, validation evidence, deviations, blockers, and handoff notes.

## Completion Checklist

- [ ] Execution plan reviewed or approved by owner.
- [x] Backend ingest/webhook contract implemented.
- [x] Event persistence and owner-scoped listing implemented.
- [x] Customer dashboard event visibility implemented.
- [x] Focused key and owner-scope tests complete.
- [ ] Documentation and graph updated.
- [x] Validation evidence collected.
- [ ] Deviations documented.
