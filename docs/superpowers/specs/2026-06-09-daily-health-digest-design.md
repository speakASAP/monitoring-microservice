# Daily Health Digest — Design Spec

**Date:** 2026-06-09
**Status:** Approved

## Overview

A scheduled Telegram digest sent every morning from `monitoring-microservice`. It reports the health state of all ecosystem services and **bolds any changes since the previous day's snapshot**, so the developer can see at a glance what has degraded or recovered overnight.

---

## Architecture

A new `DigestModule` in `src/digest/` with three focused files:

- **`ServiceHealthSnapshotEntity`** — TypeORM entity backed by `monitoring.service_health_snapshots`. One row per day, JSONB column holding all services' health state.
- **`NotificationsClient`** — thin `axios` HTTP client to notifications-microservice. Mirrors the runlayer pattern: reads `notifications.url`, `digest.notificationsToken`, `digest.telegramChatId` from config, sends `POST /notifications/send`.
- **`DailyDigestService`** — `@Cron`-driven orchestrator. Polls health, diffs against yesterday, upserts snapshot, sends Telegram message.

`DigestModule` imports `ServicesModule` (zero changes to it) and `TypeOrmModule.forFeature([ServiceHealthSnapshotEntity])`. `AppModule` adds `DigestModule`.

---

## Database Schema

Table: `monitoring.service_health_snapshots`

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK, `gen_random_uuid()` |
| `snapshot_date` | `date` | UNIQUE |
| `services` | `jsonb` | NOT NULL |
| `created_at` | `timestamptz` | DEFAULT `now()` |

One migration file: `CreateServiceHealthSnapshotsTable`. Must be run manually (`synchronize: false`).

Upsert strategy: `INSERT ... ON CONFLICT (snapshot_date) DO UPDATE` — safe for duplicate cron fires on the same day.

---

## Digest Flow

1. `@Cron(DAILY_DIGEST_CRON)` fires (default `0 8 * * *` UTC)
2. Guard: if `DAILY_DIGEST_ENABLED === 'false'`, return immediately
3. Call `ServicesService.getServicesStatus()` — current health of all monitorable services
4. Load yesterday's snapshot from DB (`snapshot_date = today − 1 day`)
5. Compute diff into four buckets:
   - **Newly failing** — healthy yesterday, unhealthy today
   - **Recovered** — unhealthy yesterday, healthy today
   - **Still failing** — unhealthy both days
   - **No prior data** — first run (skip diff section)
6. Upsert today's snapshot to DB
7. Format Telegram HTML message (see below)
8. Send via `NotificationsClient`
9. Log result via existing `common/logging`

---

## Telegram Message Format

```
🖥 <b>Monitoring Daily Digest</b> — 2026-06-09

📊 Summary: 38 healthy / 7 failing / 45 total

━━━━━━━━━━━━━━━━━━━━
<b>⚠️ CHANGES SINCE YESTERDAY</b>
━━━━━━━━━━━━━━━━━━━━
<b>⬇️ Newly failing (2):</b>
<b>• catalog-microservice — connection refused</b>
<b>• speakasap-user — timeout after 5000ms</b>

<b>✅ Recovered (1):</b>
<b>• orders-microservice</b>

━━━━━━━━━━━━━━━━━━━━
🔴 Still failing (5):
• warehouse-microservice — timeout
• payments-microservice — ECONNREFUSED
• allegro-service — timeout
• aukro-service — timeout
• heureka-service — ECONNREFUSED
```

- If no changes: changes section → `✅ No changes since yesterday`
- If first run: changes section → `ℹ️ First run — no previous snapshot to compare`
- Parse mode: HTML (same as rest of ecosystem)

---

## Config & K8s Changes

### `configuration.ts` — new `digest` block
```ts
digest: {
  enabled: process.env.DAILY_DIGEST_ENABLED !== 'false',
  cron: process.env.DAILY_DIGEST_CRON || '0 8 * * *',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
  notificationsToken: process.env.NOTIFICATION_SERVICE_TOKEN || '',
}
```

### `k8s/configmap.yaml` — add
```yaml
DAILY_DIGEST_ENABLED: "true"
DAILY_DIGEST_CRON: "0 8 * * *"
TELEGRAM_CHAT_ID: "<your-chat-id>"
```

### `k8s/external-secret.yaml` — add
```yaml
- secretKey: NOTIFICATION_SERVICE_TOKEN
  remoteRef:
    key: secret/prod/monitoring-microservice
    property: NOTIFICATION_SERVICE_TOKEN
```

---

## Files

### New
```
src/digest/digest.module.ts
src/digest/daily-digest.service.ts
src/digest/service-health-snapshot.entity.ts
src/common/notifications/notifications.client.ts
src/migrations/<timestamp>-CreateServiceHealthSnapshotsTable.ts
```

### Modified
```
src/app.module.ts             — add DigestModule
src/config/configuration.ts   — add digest config block
k8s/configmap.yaml            — add 3 env vars
k8s/external-secret.yaml      — add NOTIFICATION_SERVICE_TOKEN
```

---

## Out of Scope

- PM digest (only morning)
- Email delivery
- Retries beyond what axios timeout provides (notifications-microservice handles delivery reliability)
- Dashboard UI changes
