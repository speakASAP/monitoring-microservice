# monitoring-microservice

## Status

Production Kubernetes monitoring and observability service with an adopted IPS profile.

## Documentation Authority

Project intent is defined by `BUSINESS.md`, `SYSTEM.md`, and canonical artifacts under `docs/`; reusable standards and validation semantics are owned by `intent-preservation-system`.

## Capabilities

NestJS health and alert API, Next.js dashboard, PostgreSQL alert persistence, and the health-sweep and deploy-queue alert lifecycle.

## Interfaces

API port 3395 exposes `/health`, `/api/services`, `/api/services/list`, and `/api/alerts`; the web dashboard listens on 3396 and uses same-origin `/api/*`.

## Development

Run `npm run build`, `npm test`, or `npm run lint` at root. Build the dashboard with `cd web && npm run build`.

## Configuration

`DB_*`, `AUTH_SERVICE_URL`, `LOGGING_SERVICE_URL`, and `NOTIFICATION_SERVICE_URL` configure integrations. Secrets arrive through Vault and External Secrets Operator.

## Deployment

The service runs in `statex-apps`; `./scripts/deploy.sh` is the approved deployment flow.

## Health and Observability

Use `GET /health` and `GET /api/services/list`; operators use `https://monitoring.alfares.cz`.
