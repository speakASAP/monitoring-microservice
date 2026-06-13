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

Owner: Operations Lead. Status: reviewed. Source task: `11_tasks/TASK-002-implement-saas-access-and-customer-onboarding.md`. Lifecycle state: implementation and validation.

## Upstream Traceability

```yaml
constitution: 00_constitution/CONSTITUTION.md
vision: 01_vision/VISION.md
business_case: 02_business_case/BUSINESS_CASE.md
system: 04_systems/SYS-001-monitoring-platform.md
feature: 10_features/FEAT-002-saas-access-and-customer-onboarding.md
goal_impact: 22_goal_impact/GOAL-IMPACT-TASK-002.md
task: 11_tasks/TASK-002-implement-saas-access-and-customer-onboarding.md
```

## Goal Impact

The plan implements public customer acquisition, registered customer onboarding, and admin-only operational monitoring access while preserving Auth ownership of identity and RBAC.

## Project Invariants

- Registry and Prometheus target invariants are preserved by not editing registry or Prometheus files.
- Same-origin browser API invariant is preserved through same-origin API helper calls.
- Sensitive data invariant is preserved by using synthetic examples and excluding raw token values from docs and reports.
- Runtime source scope invariant is preserved by limiting source edits to declared files.

## Sensitive-Data Handling

Classification: synthetic. Documentation and UI seed values use `example.invalid` and generic service names. Runtime tokens and generated API keys are not stored in reports or committed as literals.

## Contract Validation Plan

Customer integration API behavior and persistence schema are added. Auth token validation is consumed via the Auth validation contract. Validation is through TypeScript build and source review; no Auth token shape change is made.

## Replay/Determinism Plan

No replay engine impact. Determinism is covered by build, unit tests, and static validation gates.

## Scope

Implement landing, Auth callback, admin guard, customer dashboard, customer integration persistence/API, documentation, graph updates, and validation evidence.

## Non-Goals

Payment collection, monitoring-owned credentials, production customer data capture, and monitoring stack replacement are out of scope.

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
- `14_prompts/PROMPT-TASK-002-saas-access-and-customer-onboarding.md`

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
- `12_validation/VAL-TASK-002-saas-access-and-customer-onboarding.md`

## Files That Must Not Be Modified

- `00_constitution/CONSTITUTION.md`
- `01_vision/VISION.md`
- Production secret files and raw environment values.

## Implementation Steps

1. Create IPS task, goal impact, context package, execution plan, prompt, and validation artifacts.
2. Add Auth consumer service and guards using Auth server-side validation.
3. Protect operational monitoring API routes with monitoring admin guard.
4. Add customer integration entity, service, controller, module, and migration SQL.
5. Replace public page with SaaS landing, pricing, and registration CTA.
6. Add Auth callback route and browser auth gate.
7. Wrap existing admin dashboard in admin auth gate without redesigning its operational layout.
8. Add customer dashboard for integration records and key rotation.
9. Run validation commands and update validation evidence.

## Test Plan

- Run `npm test -- --runInBand`.
- Run `npm run build`.
- Run `cd web && npm run build`.
- Run documentation and gate commands.

## Validation Plan

Validation passes when builds, tests, strict audit, pre-coding gate, and deployment-readiness gate pass and validation report records evidence for TASK-002.

## Gate Commands

```bash
python3 scripts/pre_coding_gate.py --root .
python3 scripts/strict_doc_audit.py --format markdown --fail-on-issues
python3 scripts/deployment_readiness_gate.py --root . --target TASK-002
```

## Documentation Updates

Update feature, task, goal impact, context package, execution plan, coding prompt, validation report, and graph.

## Rollback Plan

Revert the declared source files and documentation artifacts for TASK-002, then rebuild API and web. Customer integration table creation is additive and can remain unused or be dropped by an explicit follow-up migration if required.

## Agent Handoff Prompt

Implement TASK-002 from this execution plan. Do not modify protected vision or constitution files. Do not include raw secrets, tokens, or real customer data. Preserve existing admin dashboard design while adding Auth-backed access control.

## Completion Checklist

- [x] Implementation complete
- [x] Tests complete
- [x] Validation evidence collected
- [x] Documentation updated
- [x] Deviations documented
