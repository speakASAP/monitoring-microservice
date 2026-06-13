# EP-TASK-001: Implement IPS Governance Baseline

```yaml
id: EP-TASK-001
status: implemented
source_task: ../11_tasks/TASK-001-implement-ips-governance-baseline.md
owner: Operations Lead
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
vision: ../01_vision/VISION.md
constitution: ../00_constitution/CONSTITUTION.md
feature: ../10_features/FEAT-001-ips-governance-baseline.md
goal_impact: ../22_goal_impact/GOAL-IMPACT-TASK-001.md
upstream:
  - ../10_features/FEAT-001-ips-governance-baseline.md
downstream:
  - ../12_validation/VAL-TASK-001-ips-governance-baseline.md
related_adrs:
  - ../07_decisions/ADR-001-use-ips-governance-baseline.md
```

## Metadata

Owner: Operations Lead. Lifecycle state: implemented. Source task: `TASK-001`.

## Upstream Traceability

- Vision: `../01_vision/VISION.md`
- Constitution: `../00_constitution/CONSTITUTION.md`
- System: `../04_systems/SYS-001-monitoring-platform.md`
- Feature: `../10_features/FEAT-001-ips-governance-baseline.md`
- Goal impact: `../22_goal_impact/GOAL-IMPACT-TASK-001.md`

## Goal Impact

Creates the governance baseline needed to preserve monitoring intent, deployment invariants, and validation evidence for future changes.

## Project Invariants

- Preserve registry/probe sync expectations.
- Preserve same-origin dashboard `/api/*` routing.
- Preserve Prometheus reload-only behavior for config changes.
- Keep secrets and raw operational data out of docs and prompts.

## Sensitive-Data Handling

Classification: none. No production data, secrets, customer identifiers, or operational exports are included. Runtime `.env` files are not copied into IPS artifacts.

## Contract Validation Plan

No runtime API/database contract changes. Validate documentation contracts by running strict audit and gates.

## Replay/Determinism Plan

Audit and gate commands are deterministic except report timestamps. Build and Jest commands validate unchanged runtime code.

## Scope

Add IPS governance directories, monitoring-specific docs, reusable scripts/templates/contracts, graph schema, and validation report.

## Non-Goals

No source, dashboard, Kubernetes, service registry, database, or production deployment changes.

## Files to Inspect

- `SYSTEM.md`
- `AGENTS.md`
- `package.json`
- `src/config/ecosystem-services.ts`
- `k8s/prometheus/configmap-config.yaml`
- Company Intent Preservation System standard docs supplied for this implementation

## Files to Create

IPS numbered directories, baseline governance docs, copied standard scripts/templates/contracts, and validation report.

## Files to Modify

- `README.md`

## Files That Must Not Be Modified

- Runtime source under `src/`
- Dashboard source under `web/`
- Kubernetes manifests under `k8s/`
- Existing `.env` files

## Implementation Steps

1. Read company standard governance, contracts, templates, scripts, and examples.
2. Inspect monitoring-microservice remote documentation and runtime structure.
3. Create IPS directory structure in the remote repo.
4. Copy reusable standard scripts, templates, documentation contracts, and graph schema.
5. Create monitoring-specific traceability docs from existing repo evidence.
6. Run audit, gates, build, and tests.
7. Update validation report with command evidence.

## Test Plan

Run `npm run build` and `npm test`.

## Validation Plan

Run strict audit, pre-coding gate, deployment-readiness gate, build, and tests. Record any failed gate reason without weakening the standard.

## Gate Commands

```bash
python3 scripts/strict_doc_audit.py --format markdown --fail-on-issues
python3 scripts/pre_coding_gate.py --root .
python3 scripts/deployment_readiness_gate.py --root .
npm run build
npm test
```

## Documentation Updates

All IPS baseline documents listed in this execution plan plus `README.md`.

## Rollback Plan

Revert the added IPS directories, copied scripts/templates/contracts, validation reports, and README change in one git revert if the baseline must be removed.

## Agent Handoff Prompt

Implement future monitoring-microservice changes only after reading `AGENTS.md`, `SYSTEM.md`, `00_constitution/CONSTITUTION.md`, `01_vision/VISION.md`, the relevant task, execution plan, goal-impact record, and validation plan. Preserve registry/probe sync, same-origin dashboard routing, Prometheus reload-only behavior, and sensitive-data policy.

## Completion Checklist

- [x] Implementation complete
- [x] Tests complete
- [x] Validation evidence collected
- [x] Documentation updated
- [x] Deviations documented
