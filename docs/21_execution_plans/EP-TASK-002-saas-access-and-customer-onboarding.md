# EP-TASK-002: SaaS Access and Customer Onboarding

```yaml
id: EP-TASK-002
status: reviewed
source_task: ../11_tasks/TASK-002-implement-saas-access-and-customer-onboarding.md
owner: Operations Lead
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
```

## Metadata

Owner: Operations Lead. Status: reviewed. Source task: `docs/11_tasks/TASK-002-implement-saas-access-and-customer-onboarding.md`. Lifecycle state: implementation and validation. Execution mode: parallel goal execution across isolated agent sessions with explicit blockers, merge contracts, and validation gates.

## Upstream Traceability

```yaml
constitution: docs/00_constitution/CONSTITUTION.md
vision: docs/01_vision/VISION.md
business_case: docs/02_business_case/BUSINESS_CASE.md
system: docs/04_systems/SYS-001-monitoring-platform.md
feature: docs/10_features/FEAT-002-saas-access-and-customer-onboarding.md
goal_impact: docs/22_goal_impact/GOAL-IMPACT-TASK-002.md
task: docs/11_tasks/TASK-002-implement-saas-access-and-customer-onboarding.md
```

## Goal Impact

The plan implements public customer acquisition, registered customer onboarding, and admin-only operational monitoring access while preserving Auth ownership of identity and RBAC.

## Project Invariants

- Registry and Prometheus target invariants are preserved by not editing registry or Prometheus files.
- Same-origin browser API invariant is preserved through same-origin API helper calls.
- Sensitive data invariant is preserved by using synthetic examples and excluding raw token values from docs and reports.
- Runtime source scope invariant is preserved by limiting source edits to declared files.
- Parallel execution invariant: every agent session owns a bounded file set and records blockers before coding outside its goal boundary.

## Sensitive-Data Handling

Classification: synthetic. Documentation and UI seed values use `example.invalid` and generic service names. Runtime tokens and generated API keys are not stored in reports or committed as literals.

## Contract Validation Plan

Customer integration API behavior and persistence schema are added. Auth token validation is consumed via the Auth validation contract. Validation is through TypeScript build and source review; no Auth token shape change is made. Parallel agents must not change Auth token shape, Auth ownership, or monitoring role semantics without a new task and approval.

## Replay/Determinism Plan

No replay engine impact. Determinism is covered by build, unit tests, static validation gates, and per-goal completion evidence. Parallel sessions must leave deterministic validation commands in their handoff notes.

## Scope

Implement landing, Auth callback, admin guard, customer dashboard, customer integration persistence/API, documentation, graph updates, and validation evidence.

## Non-Goals

Payment collection, monitoring-owned credentials, production customer data capture, Auth token redesign, registry changes, Prometheus target changes, and monitoring stack replacement are out of scope.

## Parallel Execution Model

Execution is split into independent goals that can start in parallel in separate sessions with different agents. Each session must start from the same remote repository state, read the common context package and invariants, stay inside its file ownership boundary, and publish a concise handoff before merge.

Coordination rules:

- One goal per session unless the coordinator explicitly combines compatible documentation-only goals.
- Every agent records blockers as `blocking`, `non-blocking`, or `requires coordinator decision`.
- Cross-goal API contracts are owned by the goal that creates the backend surface; frontend goals consume the documented contract instead of changing it ad hoc.
- Shared files require coordinator merge order and must not be edited in parallel without a handoff note.
- Final validation runs only after all goal sessions are merged.

## Parallel Goals

### Goal A: Auth Consumption and Admin Access Boundary

Session: `session-auth-admin`. Agent profile: backend/API agent. Can start immediately.

Objective: consume Auth validation server-side and protect operational monitoring endpoints with admin-only access.

Files to inspect:

- `src/app.module.ts`
- `src/config/configuration.ts`
- `src/services/services.controller.ts`
- `src/alerts/alerts.controller.ts`
- `src/digest/digest.controller.ts`
- `src/marathon-monitoring/marathon-monitoring.controller.ts`

Files owned:

- `src/auth/auth-consumer.module.ts`
- `src/auth/auth-consumer.service.ts`
- `src/auth/monitoring-auth.guard.ts`
- `src/auth/monitoring-admin.guard.ts`
- `src/auth/session.controller.ts`
- `src/app.module.ts`
- `src/config/configuration.ts`
- API controller guard wiring files listed above

Dependencies: none inside monitoring. External contract dependency on Auth token validation endpoint and role claims.

Blockers:

- Blocking: Auth validation URL, expected success/error payload, or admin role claim is unknown.
- Blocking: existing controller tests or build reveal incompatible NestJS guard wiring.
- Non-blocking: missing production Auth environment values; use config keys and document deployment requirement without storing values.
- Requires coordinator decision: any need to change Auth token shape or add monitoring-owned identities.

Validation evidence:

- `npm run build`
- focused source review confirming anonymous operational API access is guarded
- no raw bearer token values in docs or tests

Handoff contract: document the browser session endpoint response shape and admin guard requirement for Goal C.

### Goal B: Customer Integration Persistence and API

Session: `session-customer-api`. Agent profile: backend/persistence agent. Can start immediately.

Objective: add owner-scoped customer integration records and API operations for customer onboarding.

Files to inspect:

- `src/app.module.ts`
- `src/database/migrations/001_init.sql`
- existing entity, controller, service, and module patterns under `src/`

Files owned:

- `src/customer-integrations/customer-integration.entity.ts`
- `src/customer-integrations/customer-integrations.controller.ts`
- `src/customer-integrations/customer-integrations.service.ts`
- `src/customer-integrations/customer-integrations.module.ts`
- `src/customer-integrations/dto/create-customer-integration.dto.ts`
- `src/customer-integrations/dto/update-customer-integration.dto.ts`
- `src/database/migrations/001_init.sql`
- customer integration module wiring in `src/app.module.ts`

Dependencies: consumes Goal A authenticated user identity contract. Can code against an agreed request-user shape while Goal A runs.

Blockers:

- Blocking: authenticated user id shape cannot be inferred from Goal A handoff or existing Auth contract.
- Blocking: migration ownership or current database initialization format conflicts with additive table creation.
- Non-blocking: API key generation display policy; return generated key once and avoid persisting/reporting raw values in docs.
- Requires coordinator decision: any requirement for billing, external provisioning, or real customer data import.

Validation evidence:

- `npm run build`
- unit tests or service-level checks for owner scoping where local test harness supports it
- source review confirming records are filtered by authenticated owner

Handoff contract: document endpoint paths, request/response DTOs, and one-time key rotation behavior for Goal D.

### Goal C: Public Landing, Auth Callback, and Admin Dashboard Gate

Session: `session-web-access`. Agent profile: frontend/access agent. Can start after Goal A publishes the session endpoint contract; visual page work can start immediately.

Objective: turn anonymous entry into a SaaS landing page, handle Auth callback, and gate the operational dashboard for admins.

Files to inspect:

- `web/app/page.tsx`
- `web/app/dashboard/page.tsx`
- `web/lib/api.ts`
- `web/hooks/useMonitoring.ts`

Files owned:

- `web/app/page.tsx`
- `web/app/dashboard/page.tsx`
- `web/app/auth/callback/page.tsx`
- `web/components/auth/AuthGate.tsx`
- `web/lib/auth.ts`
- `web/lib/api.ts`
- `web/hooks/useMonitoring.ts`

Dependencies: Goal A session endpoint and admin guard contract.

Blockers:

- Blocking: Auth callback parameters or token handoff format is unknown.
- Blocking: dashboard data helper cannot preserve same-origin `/api/*` calls with the new auth gate.
- Non-blocking: final marketing copy or pricing details are missing; use conservative generic copy without inventing business commitments.
- Requires coordinator decision: redesigning the operational dashboard layout beyond adding access control.

Validation evidence:

- `cd web && npm run build`
- browser/source review confirming anonymous users see landing, not operational data
- same-origin API helper behavior preserved

Handoff contract: document required Auth URL configuration and dashboard access behavior for validation.

### Goal D: Customer Dashboard and Integration Workflow UI

Session: `session-customer-ui`. Agent profile: frontend/product workflow agent. Can start after Goal B publishes the API DTO contract; shell/page layout can start immediately.

Objective: add the registered customer dashboard for integration records, key rotation, and deletion.

Files to inspect:

- `web/lib/api.ts`
- `web/lib/auth.ts`
- `web/components/auth/AuthGate.tsx`
- Goal B API handoff

Files owned:

- `web/app/customer/page.tsx`
- customer integration client helpers in `web/lib/api.ts`
- small shared auth helper changes in `web/lib/auth.ts` only when coordinated with Goal C

Dependencies: Goal A authenticated user contract and Goal B customer integration API contract.

Blockers:

- Blocking: customer integration endpoint paths or DTOs are not stable.
- Blocking: AuthGate cannot distinguish registered customer access from admin-only access.
- Non-blocking: exact customer onboarding copy is missing; use synthetic examples and no real customer identifiers.
- Requires coordinator decision: adding payment, billing, provisioning, or external monitoring setup beyond CRUD onboarding.

Validation evidence:

- `cd web && npm run build`
- source review confirming customer workflow calls owner-scoped APIs and does not expose raw secrets in docs/reports

Handoff contract: document customer workflow states for final validation smoke checks.

### Goal E: IPS Documentation, Graph, and Coding Prompt

Session: `session-ips-docs`. Agent profile: IPS/documentation agent. Can start immediately and finish after implementation handoffs are available.

Objective: keep traceability, prompts, graph, and validation report aligned with the implementation goals.

Files to inspect:

- `docs/11_tasks/TASK-002-implement-saas-access-and-customer-onboarding.md`
- `docs/12_validation/VAL-TASK-002-saas-access-and-customer-onboarding.md`
- `docs/13_context_packages/CP-TASK-002-saas-access-and-customer-onboarding.md`
- `docs/14_prompts/PROMPT-TASK-002-saas-access-and-customer-onboarding.md`
- `docs/22_goal_impact/GOAL-IMPACT-TASK-002.md`
- `graph/project_graph.yaml`
- `docs/23_documentation_contracts/SENSITIVE_DATA_POLICY.md`

Files owned:

- `docs/14_prompts/PROMPT-TASK-002-saas-access-and-customer-onboarding.md`
- `docs/12_validation/VAL-TASK-002-saas-access-and-customer-onboarding.md`
- `graph/project_graph.yaml`
- documentation-only updates needed to record implementation evidence

Dependencies: final file list, contracts, and validation evidence from Goals A-D.

Blockers:

- Blocking: implementation sessions do not provide validation evidence or deviations.
- Blocking: graph links cannot be made consistent with the final artifact set.
- Non-blocking: minor wording gaps in handoff notes; mark unknowns in mutable docs rather than inventing facts.
- Requires coordinator decision: any proposed edit to constitution, vision, or project invariants.

Validation evidence:

- `python3 scripts/strict_doc_audit.py --format markdown --fail-on-issues`
- `python3 scripts/pre_coding_gate.py --root .`
- `python3 scripts/deployment_readiness_gate.py --root . --target TASK-002`

Handoff contract: produce final validation report and list any deviations for coordinator acceptance.

### Goal F: Coordinator Merge, Validation, and Deployment Readiness

Session: `session-coordinator`. Agent profile: coordinator/release agent. Starts immediately for setup, completes after Goals A-E finish.

Objective: sequence shared-file merges, run full validation, resolve conflicts, and decide deployment readiness.

Files to inspect:

- handoffs from Goals A-E
- `git status --short`
- all modified source and IPS artifacts

Files owned:

- no feature files by default; coordinator owns merge decisions, final validation report acceptance, and deployment decision records.

Dependencies: all other goals.

Blockers:

- Blocking: unresolved shared-file conflict in `src/app.module.ts`, `web/lib/api.ts`, `web/lib/auth.ts`, or `graph/project_graph.yaml`.
- Blocking: any gate failure without a documented remediation path.
- Blocking: detected secret, raw token, or real customer data in artifacts.
- Requires coordinator decision: whether to deploy immediately after validation or leave deploy for a separate release task.

Validation evidence:

- `npm test -- --runInBand`
- `npm run build`
- `cd web && npm run build`
- `python3 scripts/pre_coding_gate.py --root .`
- `python3 scripts/strict_doc_audit.py --format markdown --fail-on-issues`
- `python3 scripts/deployment_readiness_gate.py --root . --target TASK-002`

Handoff contract: final status, validation command results, deployment decision, and rollback notes.

## Shared File Merge Order

1. Merge Goal A before Goal B for `src/app.module.ts` if both sessions modify module registration.
2. Merge Goal C before Goal D for `web/lib/auth.ts` and base auth helper behavior.
3. Merge Goal B before Goal D for customer integration API helper implementation.
4. Merge Goal E after Goals A-D provide final file lists and evidence.
5. Run Goal F validation after all source and documentation merges are complete.

## Files to Inspect

- `web/app/page.tsx`
- `web/app/dashboard/page.tsx`
- `web/lib/api.ts`
- `web/hooks/useMonitoring.ts`
- `src/app.module.ts`
- `src/config/configuration.ts`
- `src/services/services.controller.ts`
- `src/alerts/alerts.controller.ts`
- `src/digest/digest.controller.ts`
- `src/marathon-monitoring/marathon-monitoring.controller.ts`
- `docs/11_tasks/TASK-002-implement-saas-access-and-customer-onboarding.md`
- `docs/13_context_packages/CP-TASK-002-saas-access-and-customer-onboarding.md`
- `docs/17_governance/PROJECT_INVARIANTS.md`
- `docs/23_documentation_contracts/SENSITIVE_DATA_POLICY.md`

## Files to Create

- `src/auth/auth-consumer.module.ts`
- `src/auth/auth-consumer.service.ts`
- `src/auth/monitoring-auth.guard.ts`
- `src/auth/monitoring-admin.guard.ts`
- `src/auth/session.controller.ts`
- `src/customer-integrations/customer-integration.entity.ts`
- `src/customer-integrations/customer-integrations.controller.ts`
- `src/customer-integrations/customer-integrations.service.ts`
- `src/customer-integrations/customer-integrations.module.ts`
- `src/customer-integrations/dto/create-customer-integration.dto.ts`
- `src/customer-integrations/dto/update-customer-integration.dto.ts`
- `web/components/auth/AuthGate.tsx`
- `web/lib/auth.ts`
- `web/app/auth/callback/page.tsx`
- `web/app/customer/page.tsx`
- `docs/14_prompts/PROMPT-TASK-002-saas-access-and-customer-onboarding.md`

## Files to Modify

- `src/app.module.ts`
- `src/config/configuration.ts`
- `src/database/migrations/001_init.sql`
- `src/services/services.controller.ts`
- `src/alerts/alerts.controller.ts`
- `src/digest/digest.controller.ts`
- `src/marathon-monitoring/marathon-monitoring.controller.ts`
- `web/app/page.tsx`
- `web/app/dashboard/page.tsx`
- `web/lib/api.ts`
- `web/hooks/useMonitoring.ts`
- `graph/project_graph.yaml`
- `docs/12_validation/VAL-TASK-002-saas-access-and-customer-onboarding.md`

## Files That Must Not Be Modified

- `docs/00_constitution/CONSTITUTION.md`
- `docs/01_vision/VISION.md`
- Production secret files and raw environment values.

## Implementation Steps

1. Coordinator opens six goal sessions: `session-auth-admin`, `session-customer-api`, `session-web-access`, `session-customer-ui`, `session-ips-docs`, and `session-coordinator`.
2. Goals A, B, and E start immediately from the shared IPS context.
3. Goal C starts landing work immediately and waits for Goal A only for session/admin contract wiring.
4. Goal D starts page shell work immediately and waits for Goals A-B for API/auth contract wiring.
5. Each implementation session records blockers, deviations, changed files, and validation evidence in its handoff.
6. Coordinator merges shared files in the defined merge order.
7. IPS documentation session updates prompt, graph, and validation report from final handoffs.
8. Coordinator runs full validation and records final deployment readiness.

## Test Plan

- Goal A: API build and guard source review.
- Goal B: API build and owner-scope service checks.
- Goal C: web build and anonymous/admin access behavior review.
- Goal D: web build and customer workflow review.
- Goal E: strict documentation audit and IPS gates.
- Goal F: full test/build/gate suite after merge.

## Validation Plan

Validation passes when builds, tests, strict audit, pre-coding gate, and deployment-readiness gate pass; every parallel goal has a handoff with blockers resolved or accepted; and the validation report records evidence for TASK-002.

## Gate Commands

```bash
npm test -- --runInBand
npm run build
cd web && npm run build
python3 scripts/pre_coding_gate.py --root .
python3 scripts/strict_doc_audit.py --format markdown --fail-on-issues
python3 scripts/deployment_readiness_gate.py --root . --target TASK-002
```

## Documentation Updates

Update feature, task, goal impact, context package, execution plan, coding prompt, validation report, and graph. Documentation updates must record parallel session handoffs, blockers, accepted deviations, and final validation evidence without storing secrets or raw production data.

## Rollback Plan

Rollback by goal boundary:

- Goal A: remove Auth consumer module, guards, session controller, config additions, and controller guard wiring.
- Goal B: remove customer integration module, entity, DTOs, service/controller, and additive migration if not deployed; if deployed, use an explicit follow-up migration to drop unused objects.
- Goal C: restore anonymous page/dashboard behavior only if the business decision to abandon SaaS access is approved.
- Goal D: remove customer dashboard and integration client helpers.
- Goal E: revert TASK-002 documentation, graph, prompt, and validation report updates.
- Goal F: rerun build and IPS gates after rollback before any deployment.

## Agent Handoff Prompt

Implement only the assigned goal from this execution plan. Use a separate session and stay within the goal-owned files unless a blocker requires coordinator approval. Record blockers, changed files, validation commands, deviations, and handoff contracts. Do not modify protected vision or constitution files. Do not include raw secrets, tokens, real customer data, or confidential identifiers. Preserve existing admin dashboard design while adding Auth-backed access control.

## Completion Checklist

- [x] Parallel goal model documented
- [x] Blockers documented per goal
- [x] Shared-file merge order documented
- [x] Implementation complete
- [x] Tests complete
- [x] Validation evidence collected
- [x] Documentation updated
- [x] Deviations documented
