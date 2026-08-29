# Claude Instructions

Shared rules live here:

- Claude profile: `/home/ssf/.claude/CLAUDE.md`
- Shared ecosystem instructions: `/home/ssf/Documents/Github/CLAUDE.md`
- Codex profile: `/home/ssf/.codex/AGENTS.md`
- Cross-agent standard: `/home/ssf/.ai-agent-standards/CROSS_AGENT_AUTOMATION_STANDARD.md`
- Repository operations: `AGENT_OPERATIONS.md`

Read those first, then follow the repository-specific notes below and the current planning/status files.


## Repository-Specific Notes

# CLAUDE.md

## Knowledge Retrieval

Use `docs-rag-microservice` for bounded discovery when it is healthy, then
verify deployment, security, database, integration and public-contract facts
against the cited Git source. Git remains authoritative.

Authority and fallback rules:
`/home/ssf/Documents/Github/shared/docs/DOCUMENTATION_AUTHORITY.md`.

Do not generate tokens in documentation or assume an unconfident/failed RAG
response means that source documentation does not exist.

## Commands

### Backend (NestJS — repo root)
```bash
npm run build          # compile TypeScript → dist/
npm run start:dev      # watch mode, port 3395
npm run test           # jest
npm run test:watch     # jest --watch
npm run test:cov       # with coverage
npm run lint           # eslint src --ext .ts
```

Run a single test file:
```bash
npx jest src/alerts/alerts.service.spec.ts
```

### Frontend (Next.js — `web/`)
```bash
cd web && npm run dev    # dev server, port 3396
cd web && npm run build
cd web && npm run start  # production, port 3396
```

## Architecture

Two separately deployed containers that share the same repo:

| Container | Dockerfile | Port | Purpose |
|---|---|---|---|
| `monitoring-microservice` | `Dockerfile` | 3395 | NestJS API + Prometheus webhook receiver |
| `monitoring-web` | `Dockerfile.web` | 3396 | Next.js dashboard UI |

### NestJS backend (`src/`)

Three feature modules wired into `AppModule`:

- **AlertsModule** — CRUD for `Alert` entities (PostgreSQL, schema `monitoring`). Statuses: `active` → `acknowledged` → `resolved`.
- **ServicesModule** — Polls each ecosystem service's health endpoint (registry in `src/config/ecosystem-services.ts`). Returns status + response time.
- **WebhooksModule** — Receives Alertmanager webhook POSTs at `POST /api/webhooks/alertmanager`, creates `Alert` rows, and forwards notifications to `notifications-microservice`.

`HealthController` exposes `GET /health` (used by K8s probes).

Database: TypeORM with `synchronize: false` — migrations must be run manually. The DB schema is always `monitoring`.

### Next.js frontend (`web/`)

App Router (`web/app/`). The dashboard page (`web/app/dashboard/page.tsx`) polls the NestJS API. Components live in `web/components/dashboard/` and `web/components/ui/`.

### Config & secrets

`src/config/configuration.ts` maps env vars to typed config paths. In K8s, env is injected via `ConfigMap` (`k8s/configmap.yaml`) and `ExternalSecret` (`k8s/external-secret.yaml` — pulls from Vault `secret/prod/monitoring-microservice`).

Key env vars:

| Var | Default | Purpose |
|---|---|---|
| `PORT` | 3395 | Backend listen port |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | `db-server-postgres:5432` | Postgres |
| `NOTIFICATION_SERVICE_URL` | `http://notifications-microservice:3368` | Alert forwarding |
| `PROMETHEUS_URL` / `GRAFANA_URL` / `ALERTMANAGER_URL` | internal cluster URLs | Observability stack |

### Observability stack (K8s manifests in `k8s/`)

Deployed alongside the microservice in `statex-apps` namespace:

- **Prometheus** — scrape config in `k8s/prometheus/configmap-config.yaml`, alert rules in `k8s/prometheus/configmap-rules.yaml`
- **Alertmanager** — routes alerts to the webhook endpoint of this service
- **Grafana** — datasources in `k8s/grafana/configmap-datasources.yaml`, dashboards in `k8s/grafana/configmap-dashboards.yaml`
- **node-exporter** — DaemonSet for host metrics

### Ecosystem service registry

`ECOSYSTEM_SERVICES` in `src/config/ecosystem-services.ts` is the single source of truth for which services are monitored; `services.service.ts` only imports it. Internal URLs follow the pattern `http://<name>.statex-apps.svc.cluster.local:<port>`.

Each entry may set `healthPath` (default `/health`). Next.js frontends in this ecosystem serve `/api/health`, **not** `/health` — omitting `healthPath` for a frontend silently produces a permanent 404 in the digest. `checkServiceHealth` classifies a 404/405 on the health path as `configError` rather than a real outage, and `ServicesService.onModuleInit` logs any such services at startup.
