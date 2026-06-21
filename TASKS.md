# Tasks: monitoring-microservice

## Backlog

- [ ] TASK-MON-001: Owner-maintained monitoring implementation or operations lane.
  - Current status: `main...origin/main` at `cbdf959`; `BUSINESS.md` and `TASKS.md` are untracked; `SYSTEM.md` is tracked; no root `STATE.json` is present by owner decision.
  - Missing queue / standard-file issue: root `TASKS.md` exists but did not identify the next monitoring implementation, target coverage, alerting, or operations priority.
  - Risk: monitoring work can affect production visibility and false-positive repair loops; agents need a bounded queue before changing target lists, alert routes, dashboards, or deploy configuration.
  - Suggested owner decision: approve `TASKS.md` as the compact queue and choose one first lane: target inventory reconciliation, alert/health-check noise reduction, dashboard validation, or deployment readiness verification.
  - Future implementation agent allowed files: `TASKS.md` only unless the owner separately approves tracking existing `BUSINESS.md`.
  - Future implementation agent forbidden files: `src/`, `web/`, deploy scripts, runtime config, secrets, Kubernetes/service discovery config, and generated validation/state reports.
  - Validation checks: `git status --short --branch`; `git diff --check -- .`; `npm run lint`; `npm test`; run IPS/doc gates only if future docs beyond `TASKS.md` are approved.
  - Merge order: if the selected lane depends on cluster target decisions, merge after `k8s-manifests` queue approval; otherwise merge independently.

## Completed

- [x] 2026-06-21 Added `BUSINESS.md` and `TASKS.md` to restore agent-doc quartet coverage.
