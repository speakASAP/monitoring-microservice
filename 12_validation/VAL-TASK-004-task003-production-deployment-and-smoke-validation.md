# Validation Report

Validation id: VAL-TASK-004
Target: TASK-004
Date: 2026-06-15
Validator: AI agent

## Summary

Validated TASK-004 production deployment and smoke validation for TASK-003 customer integration ingest. Commit `99a4f0c` was built, pushed, rolled out to fresh API and web pods with immutable image tags, and smoke-tested with synthetic data.

## Upstream goal

- `10_features/FEAT-004-task003-production-deployment-and-smoke-validation.md`
- `22_goal_impact/GOAL-IMPACT-TASK-004.md`
- `11_tasks/TASK-004-task003-production-deployment-and-smoke-validation.md`

## Criteria checked

| Criterion | Result | Evidence |
|---|---|---|
| Deployment approval confirmed | Pass | Owner said "Go ahead" after TASK-004 deployment approval prompt. |
| Remote source state controlled | Pass | Clean execution worktree used; delegated frontend fix committed as `99a4f0c` before deployment. |
| Deployment completed | Pass with correction | `./scripts/deploy.sh` built/pushed images and applied manifests; immutable-tag rollout correction was required because `:latest` did not replace pods. |
| API and web rollout checked | Pass | `monitoring-microservice` and `monitoring-web` rolled out with immutable tag `99a4f0c`. |
| Valid synthetic ingest accepted | Pass | `POST /api/ingest/:apiKeyId` returned 202 and persisted an `ingest` event. |
| Duplicate synthetic event id idempotent | Pass | Repeat ingest returned 202 with duplicate=true. |
| Valid synthetic webhook accepted | Pass | `POST /api/customer/webhooks/:apiKeyId` returned 202 and persisted a `webhook` event. |
| Invalid key rejected | Pass | Invalid-key ingest returned 401. |
| Owner-scoped event listing | Pass | Synthetic Auth user token was stored in Vault, synced to Kubernetes Secret key names, and `route:api-customer-integration-events` returned 200 with the synthetic event listed. |
| Anonymous operational API protected | Pass | `route:api-services`, `route:api-alerts`, `route:api-auth-session`, and `route:api-customer-integrations` returned 401 without credentials. |
| Registry count valid | Pass | Deployed pod compiled config reported 56 ecosystem services. |
| Sensitive evidence masked | Pass | Evidence includes statuses and synthetic run id only; no raw keys, Auth tokens, headers, or production payloads. |

## Gate evidence

- Web build for delegated frontend fix: `cd web && npm run build` passed.
- Deployment command: `./scripts/deploy.sh` completed successfully in 24.51s.
- Manual immutable rollout: set API and web deployments to `localhost:5000/...:99a4f0c`; both rollouts succeeded.
- API health: `/health` returned 200 in the deployed API pod.
- Registry verification: compiled `ECOSYSTEM_SERVICES` count is 56.
- Unauthenticated smoke result id: `task004-mqf2t1j1-a58b4a`.
- Authenticated owner-listing smoke result id: `task004-auth-mqf81ns9-d5c5db`; Auth registration and validation passed, ingest returned 202, owner event listing returned 200, and the synthetic event was found.
- Vault storage: the monitoring production Vault secret contains smoke token properties `MONITORING_SMOKE_AUTH_TOKEN` and `MONITORING_SMOKE_REFRESH_TOKEN`.
- Kubernetes Secret sync: `monitoring-microservice-secret` contains key names `MONITORING_SMOKE_AUTH_TOKEN` and `MONITORING_SMOKE_REFRESH_TOKEN` with ESO `SecretSynced=True`.
- Strict documentation audit, pre-coding gate, and deployment-readiness gate were run after this report.

## Invariant evidence

- Deployment used the repository deployment script, then corrected live rollout to immutable commit tags.
- No changes were made to `src/config/ecosystem-services.ts` or Prometheus targets.
- Prometheus config was reloaded without rollout restart.
- Smoke used public `monitoring.alfares.cz` public API routes routes.
- No raw API keys, Authorization headers, Auth tokens, production customer identifiers, or production payloads are included.

## Sensitive-data scan evidence

Synthetic smoke generated transient API key material inside the API pod process. The raw key was not printed, committed, stored in reports, or copied into prompts.

## Replay and determinism evidence

Smoke used client-supplied synthetic event ids. Replaying the ingest event id returned an idempotent duplicate response instead of inserting a duplicate row.

## Issues found

- The deploy script used `:latest` for `kubectl set image`, so Kubernetes did not roll pods when the image field was unchanged. The script is updated to set immutable `$API_IMAGE` and `$WEB_IMAGE` tags.
- The deploy script registry verification called `route:api-services-list`, which is guarded in the deployed API. The script is updated to count compiled `ECOSYSTEM_SERVICES` inside the pod instead.

## Recommendation

Accept TASK-004 deployment and smoke validation. Authenticated customer event listing is now verified with a synthetic Auth smoke token stored through Vault and ESO.

## Traceability confirmation

TASK-004 preserves the Intent Preservation chain from monitoring vision through goal impact, feature, task, execution plan, coding prompt, deployed code, and validation evidence. TASK-003 customer ingest behavior is live in production on immutable image tag `99a4f0c` with sanitized smoke evidence.
