# TASK-001: Implement IPS Governance Baseline

```yaml
id: TASK-001
status: completed
owner: Operations Lead
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../10_features/FEAT-001-ips-governance-baseline.md
goal_impact:
  - ../22_goal_impact/GOAL-IMPACT-TASK-001.md
execution_plan:
  - ../21_execution_plans/EP-TASK-001-implement-ips-governance-baseline.md
```

## Objective

Add the company Intent Preservation System baseline to monitoring-microservice without changing runtime behavior.

## Upstream Links

- `../10_features/FEAT-001-ips-governance-baseline.md`
- `../04_systems/SYS-001-monitoring-platform.md`
- `../01_vision/VISION.md`

## Goal Impact

High impact on governance and operational safety because future AI-assisted changes must be traceable and validated.

## Project Invariant Impact

Preserves invariants in `../17_governance/PROJECT_INVARIANTS.md`, especially registry/probe sync, same-origin dashboard API routes, Prometheus reload-only behavior, and sensitive-data exclusion.

## Sensitive-Data Classification

Classification: none

The task creates governance documents and scripts only. It does not include secrets, raw production records, customer identifiers, or operational exports.

## Contract/Schema Impact

No runtime API or database schema contract changes. Documentation/gate contract files are added under `23_documentation_contracts/` and `scripts/`.

## Replay/Determinism Impact

Gate and audit commands are deterministic against the repository state except timestamps in generated reports.

## Scope

- Create IPS directory structure.
- Add monitoring-specific source-of-truth documents.
- Copy reusable IPS scripts, templates, documentation contracts, and graph schema.
- Add initial validation evidence.

## Non-Goals

- Modify `src/`, `web/`, or `k8s/` runtime behavior.
- Deploy to production.
- Add or change monitored services.

## Acceptance Criteria

- [x] Required IPS docs and groups exist.
- [x] Standard scripts/templates/contracts are present.
- [x] Task has upstream traceability, goal impact, execution plan, validation criteria, and gates.
- [x] Build and unit tests are run after the documentation baseline is added.

## Required Context

- `SYSTEM.md`
- `AGENTS.md`
- `package.json`
- `src/config/ecosystem-services.ts`
- `k8s/prometheus/configmap-config.yaml`
- Company Intent Preservation System standard docs supplied for this implementation

## Validation Task

Run strict audit, pre-coding gate, deployment-readiness gate, `npm run build`, and `npm test`; record results in `../12_validation/VAL-TASK-001-ips-governance-baseline.md`.

## Required Gates

- Pre-coding gate: `python3 scripts/pre_coding_gate.py --root .`
- Deployment-readiness gate: `python3 scripts/deployment_readiness_gate.py --root .`
- Strict audit: `python3 scripts/strict_doc_audit.py --format markdown --fail-on-issues`

## Execution Plan Requirement

This task was converted into work only after creating `../21_execution_plans/EP-TASK-001-implement-ips-governance-baseline.md` as a draft execution plan for the baseline implementation.
