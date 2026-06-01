# AGENTS.md — monitoring-microservice

## Knowledge Retrieval (query before reading files)
Query the RAG service first — saves 2000-5000 tokens per query:
- URL: `http://docs-rag-microservice.statex-apps.svc.cluster.local:3397`
- Endpoint: `POST /retrieval/agent-context` with `{"query": "...", "maxTokens": 3000}`
- Auth: `Authorization: Bearer <JWT_TOKEN>`

## Boundaries

- **API:** `src/` — NestJS, ecosystem registry, alerts, webhooks
- **Dashboard:** `web/` — Next.js operational UI
- **Stack:** `k8s/` — Prometheus, Grafana, Loki, Alertmanager, exporters (do not edit nginx-microservice)

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
