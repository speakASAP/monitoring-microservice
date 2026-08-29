# Repository Agent Instructions

Shared rules live here:

- Codex profile: `/home/ssf/.codex/AGENTS.md`
- Cross-agent standard: `/home/ssf/.ai-agent-standards/CROSS_AGENT_AUTOMATION_STANDARD.md`
- Repository operations: `AGENT_OPERATIONS.md`

Read those first, then follow the repository-specific notes below and the current planning/status files.


## Repository-Specific Notes

# AGENTS.md — monitoring-microservice

## Intent Preservation System

This repository follows the company standard in the numbered IPS directories.

Before code changes, read:

- `docs/00_constitution/CONSTITUTION.md`
- `docs/01_vision/VISION.md`
- `docs/17_governance/PROJECT_INVARIANTS.md`
- relevant `docs/11_tasks/`, `docs/21_execution_plans/`, `docs/22_goal_impact/`, and `docs/12_validation/` artifacts

Required gates for governance or deployment-impacting work:

```bash
python3 scripts/strict_doc_audit.py --format markdown --fail-on-issues
python3 scripts/pre_coding_gate.py --root .
python3 scripts/deployment_readiness_gate.py --root .
```

Do not put secrets, raw production data, confidential identifiers, or real customer data in prompts, examples, logs, plans, tests, screenshots, or reports.

## Knowledge Retrieval

Use `docs-rag-microservice` for bounded discovery when it is healthy, then
verify deployment, security, database, integration and public-contract facts
against the cited Git source. Git remains authoritative.

Authority and fallback rules:
`/home/ssf/Documents/Github/shared/docs/DOCUMENTATION_AUTHORITY.md`.

Do not generate tokens in documentation or assume an unconfident/failed RAG
response means that source documentation does not exist.

## Boundaries

- **API:** `src/` — NestJS, ecosystem registry, alerts, webhooks
- **Dashboard:** `web/` — Next.js operational UI
- **Stack:** `k8s/` — Prometheus, Grafana, Alertmanager, exporters (do not edit nginx-microservice)

## Key commands

```bash
npm run build          # compile API
npm test               # unit tests
./scripts/deploy.sh    # full K8s deploy (API + web + monitoring stack)
```

## Registry

All apps/services/repos: `src/config/ecosystem-services.ts`  
Prometheus probes: `k8s/prometheus/configmap-config.yaml` (keep in sync)

## Deploy rules

- Always use `./scripts/deploy.sh` on production
- After registry changes: rebuild API image (deploy script does this)
- Prometheus: reload config only — never rollout restart (PVC lock)
