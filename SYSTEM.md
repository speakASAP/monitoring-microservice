# System: monitoring-microservice

## Service identity

- Service name: `monitoring-microservice`
- Web deployment: `monitoring-web`
- Domain: `monitoring.alfares.cz`
- Grafana: `grafana.alfares.cz`
- Runtime: NestJS API (Node 24-slim) + Next.js dashboard
- Ports: API `3395`, frontend `3396`

## Deployment

**Platform:** Kubernetes (k3s) · namespace `statex-apps`  
**Images:** `localhost:5000/monitoring-microservice:latest`, `localhost:5000/monitoring-web:latest`  
**Deploy:** `./scripts/deploy.sh`  
**Logs:** `kubectl logs -n statex-apps -l app=monitoring-microservice -f`  
**Restart API only:** `kubectl rollout restart deployment/monitoring-microservice -n statex-apps`

### What deploy.sh does

1. Builds and pushes API + web Docker images
2. Applies all manifests under `k8s/` (Prometheus, Grafana, Loki, Alertmanager, blackbox, node-exporter, kube-state-metrics, API, web, ingress)
3. **Reloads Prometheus config** via `POST /-/reload` (never `rollout restart` Prometheus — single PVC causes lock crash)
4. Rolls out `monitoring-microservice` and `monitoring-web`
5. Verifies `/health` and that `/api/services/list` returns 50+ entries

### Adding or changing monitored services

Edit **`src/config/ecosystem-services.ts`** (single registry for dashboard + health checks).

Then sync Prometheus blackbox targets in **`k8s/prometheus/configmap-config.yaml`** (same services/ports/paths).

Run `./scripts/deploy.sh` — applying ConfigMap alone is not enough; the **API image must be rebuilt** or the dashboard will show the old list.

Repository-only entries (`kind: 'repository'`) appear in the dashboard but are not probed.

### Prometheus config reload (manual)

```bash
POD=$(kubectl get pod -n statex-apps -l app=prometheus --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n statex-apps "$POD" -- wget -qO- --post-data='' 'http://127.0.0.1:9090/-/reload'
```

Do **not** use `kubectl rollout restart deployment/prometheus` — RWO volume lock prevents two pods.

## Monitoring stack (statex-apps)

| Component | Service | Port |
|-----------|---------|------|
| Prometheus | prometheus | 9090 |
| Grafana | grafana | 3000 |
| Loki | loki | 3100 |
| Alertmanager | alertmanager | 9093 |
| Blackbox exporter | blackbox-exporter | 9115 |
| Node exporter | node-exporter | 9100 |
| kube-state-metrics | kube-state-metrics | 8080 |

Scrape targets: `k8s/prometheus/configmap-config.yaml` (blackbox HTTP probes for ecosystem `/health` endpoints).

### Dashboard API calls

The Next.js dashboard runs in the browser and must call **`/api/*` on the same origin** (`https://monitoring.alfares.cz/api/...` via ingress). Do not point the frontend at internal cluster URLs (`monitoring-microservice:3395`) — the browser cannot resolve them and the UI falls back to empty/mock data.

## Dependencies

| Service | Usage |
|---------|-------|
| auth-microservice | JWT (future dashboard auth) |
| database-server (`DB_*`) | PostgreSQL — alerts/incidents |
| logging-microservice | Operational logs |
| notifications-microservice | Alert delivery (Telegram via webhook) |

## Secrets

Vault path: `secret/prod/monitoring-microservice` → ESO → `monitoring-microservice-secret`

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| GET | /api/services | All services with live health status |
| GET | /api/services/list | Registry without health probe |
| GET | /api/alerts | Alerts |
| POST | /api/webhooks/alertmanager | Alertmanager webhook |

## Current state

Stage: production · Deploy: Kubernetes (`statex-apps`)
