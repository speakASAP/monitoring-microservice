---
status: done
owner: repository-owner
last_updated: 2026-09-04
---

<!-- Delivered and evidenced. The regression this plan was held open for is resolved:
     the daily digest reached Telegram again on 2026-09-04 08:00:00.789 UTC
     (notifications row 303b798b-5e70-46ba-b206-5af8ce26a859, messageId 2863) after
     nine missing days, 2026-08-26 -> 2026-09-03.
       - applied database migration: CONFIRMED. monitoring.service_health_snapshots exists and is
         written daily.
       - live deployment: CONFIRMED. monitoring-microservice is Running in statex-apps, the digest
         is scheduled in-process via @Cron (there is no k8s CronJob, so its absence is not a
         defect), and DAILY_DIGEST_ENABLED=true with DAILY_DIGEST_CRON="0 8 * * *" in the pod.
       - cron-delivered Telegram message: CONFIRMED 2026-09-04, messageId 2863.
     Delivery was restored by notifications-microservice b1992cd (dedup key now requires
     identical content and service). Three follow-on defects found while diagnosing it are
     fixed here: e73f64f escalates a failed digest out of band instead of swallowing it,
     50bd870 authenticates log ingest, 7d256e2 nests log extras under `metadata` so
     forbidNonWhitelisted stops rejecting every structured event.
     The unchecked boxes below are the original build steps, kept as the historical record of
     a plan that shipped; see TASKS.md for the outstanding follow-ups, which are separate
     items and do not hold this plan open. -->

# Daily Health Digest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send a daily Telegram digest every morning showing ecosystem service health, with bold-highlighted changes since the previous day's snapshot.

**Architecture:** A new `DigestModule` added to the existing NestJS monitoring-microservice. It contains a `ServiceHealthSnapshotEntity` (PostgreSQL JSONB snapshot per day), a `NotificationsClient` (HTTP to notifications-microservice), and a `DailyDigestService` with a `@Cron` trigger. The cron polls `ServicesService.getServicesStatus()`, diffs against yesterday's DB snapshot, upserts today's snapshot, and sends a formatted Telegram HTML message.

**Tech Stack:** NestJS 10, TypeORM 0.3, @nestjs/schedule (already installed), axios (already installed), Jest, PostgreSQL

---

## File Map

---

## Task 1: Apply DB Migration

No TypeORM CLI data-source is configured in this project. Run the migration as raw SQL via kubectl.

**Files:**
- Create: `scripts/migrate-service-health-snapshots.sql`

- [ ] **Step 1: Write the SQL migration file**

```sql
-- scripts/migrate-service-health-snapshots.sql
CREATE TABLE IF NOT EXISTS monitoring.service_health_snapshots (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE       NOT NULL,
  services    JSONB       NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_service_health_snapshots_date UNIQUE (snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_service_health_snapshots_date
  ON monitoring.service_health_snapshots (snapshot_date DESC);
```

- [ ] **Step 2: Apply the migration**

```bash
kubectl -n statex-apps exec -i deployment/db-server-postgres -- \
  psql -U postgres -d monitoring < scripts/migrate-service-health-snapshots.sql
```

Expected output:
```
CREATE TABLE
CREATE INDEX
```

- [ ] **Step 3: Verify the table exists**

```bash
kubectl -n statex-apps exec -it deployment/db-server-postgres -- \
  psql -U postgres -d monitoring -c "\d monitoring.service_health_snapshots"
```

Expected: table description with columns `id`, `snapshot_date`, `services`, `created_at`.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-service-health-snapshots.sql
git commit -m "feat(digest): add service_health_snapshots migration SQL"
```

---

## Task 2: ServiceHealthSnapshot Entity

**Files:**
- Create: `src/digest/service-health-snapshot.entity.ts`

- [ ] **Step 1: Create the entity**

```typescript
// src/digest/service-health-snapshot.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export interface SnapshotServiceEntry {
  name: string;
  healthy: boolean;
  responseTimeMs: number;
  error?: string;
}

@Entity({ name: 'service_health_snapshots', schema: 'monitoring' })
export class ServiceHealthSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date', unique: true })
  snapshotDate: string; // 'YYYY-MM-DD'

  @Column({ type: 'jsonb' })
  services: SnapshotServiceEntry[];

  @CreateDateColumn()
  createdAt: Date;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/digest/service-health-snapshot.entity.ts
git commit -m "feat(digest): add ServiceHealthSnapshot entity"
```

---

## Task 3: Digest Utils (Pure Logic — TDD)

The diff and formatting logic is a pure function with no side effects — ideal for TDD.

**Files:**
- Create: `src/digest/digest.utils.ts`
- Create: `src/digest/digest.utils.spec.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/digest/digest.utils.spec.ts
import { computeDiff, formatDigestMessage, DigestDiff } from './digest.utils';
import { SnapshotServiceEntry } from './service-health-snapshot.entity';

const healthy = (name: string): SnapshotServiceEntry => ({ name, healthy: true, responseTimeMs: 50 });
const failing = (name: string, error = 'timeout'): SnapshotServiceEntry => ({ name, healthy: false, responseTimeMs: 5000, error });

describe('computeDiff', () => {
  it('detects newly failing service', () => {
    const yesterday = [healthy('svc-a'), healthy('svc-b')];
    const today = [healthy('svc-a'), failing('svc-b', 'ECONNREFUSED')];
    const diff = computeDiff(today, yesterday);
    expect(diff.newlyFailing).toEqual([failing('svc-b', 'ECONNREFUSED')]);
    expect(diff.recovered).toEqual([]);
    expect(diff.stillFailing).toEqual([]);
  });

  it('detects recovered service', () => {
    const yesterday = [failing('svc-a'), healthy('svc-b')];
    const today = [healthy('svc-a'), healthy('svc-b')];
    const diff = computeDiff(today, yesterday);
    expect(diff.recovered).toEqual([healthy('svc-a')]);
    expect(diff.newlyFailing).toEqual([]);
    expect(diff.stillFailing).toEqual([]);
  });

  it('detects still failing service', () => {
    const yesterday = [failing('svc-a')];
    const today = [failing('svc-a', 'timeout')];
    const diff = computeDiff(today, yesterday);
    expect(diff.stillFailing).toEqual([failing('svc-a', 'timeout')]);
    expect(diff.newlyFailing).toEqual([]);
    expect(diff.recovered).toEqual([]);
  });

  it('returns null diff when no yesterday snapshot', () => {
    const today = [healthy('svc-a'), failing('svc-b')];
    const diff = computeDiff(today, null);
    expect(diff).toBeNull();
  });
});

describe('formatDigestMessage', () => {
  const today = [healthy('auth'), failing('catalog', 'timeout'), failing('payments', 'ECONNREFUSED')];
  const dateKey = '2026-06-09';

  it('includes summary counts', () => {
    const msg = formatDigestMessage(today, null, dateKey);
    expect(msg).toContain('1 healthy');
    expect(msg).toContain('2 failing');
    expect(msg).toContain('3 total');
  });

  it('shows first-run message when no diff', () => {
    const msg = formatDigestMessage(today, null, dateKey);
    expect(msg).toContain('First run');
  });

  it('bolds newly failing services', () => {
    const yesterday = [healthy('auth'), healthy('catalog'), healthy('payments')];
    const diff = computeDiff(today, yesterday);
    const msg = formatDigestMessage(today, diff, dateKey);
    expect(msg).toContain('<b>• catalog — timeout</b>');
    expect(msg).toContain('<b>• payments — ECONNREFUSED</b>');
  });

  it('bolds recovered services', () => {
    const yesterday = [failing('auth'), failing('catalog'), failing('payments')];
    const todayAllHealthy = [healthy('auth'), healthy('catalog'), healthy('payments')];
    const diff = computeDiff(todayAllHealthy, yesterday);
    const msg = formatDigestMessage(todayAllHealthy, diff, dateKey);
    expect(msg).toContain('<b>• auth</b>');
    expect(msg).toContain('<b>• catalog</b>');
  });

  it('shows no changes message when diff is empty', () => {
    const yesterday = [healthy('auth'), failing('catalog'), failing('payments')];
    const diff = computeDiff(today, yesterday);
    const msg = formatDigestMessage(today, diff, dateKey);
    expect(msg).toContain('No changes since yesterday');
  });

  it('lists still failing services without bold', () => {
    const yesterday = [healthy('auth'), failing('catalog'), failing('payments')];
    const diff = computeDiff(today, yesterday);
    const msg = formatDigestMessage(today, diff, dateKey);
    expect(msg).toContain('• catalog — timeout');
    expect(msg).toContain('• payments — ECONNREFUSED');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest src/digest/digest.utils.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: `Cannot find module './digest.utils'`

- [ ] **Step 3: Implement digest.utils.ts**

```typescript
// src/digest/digest.utils.ts
import { SnapshotServiceEntry } from './service-health-snapshot.entity';

export interface DigestDiff {
  newlyFailing: SnapshotServiceEntry[];
  recovered: SnapshotServiceEntry[];
  stillFailing: SnapshotServiceEntry[];
}

export function computeDiff(
  today: SnapshotServiceEntry[],
  yesterday: SnapshotServiceEntry[] | null,
): DigestDiff | null {
  if (!yesterday) return null;

  const yesterdayMap = new Map(yesterday.map((s) => [s.name, s]));

  const newlyFailing: SnapshotServiceEntry[] = [];
  const recovered: SnapshotServiceEntry[] = [];
  const stillFailing: SnapshotServiceEntry[] = [];

  for (const svc of today) {
    const prev = yesterdayMap.get(svc.name);
    if (!prev) continue; // new service — skip diff
    if (!svc.healthy && prev.healthy) newlyFailing.push(svc);
    else if (svc.healthy && !prev.healthy) recovered.push(svc);
    else if (!svc.healthy && !prev.healthy) stillFailing.push(svc);
  }

  return { newlyFailing, recovered, stillFailing };
}

export function formatDigestMessage(
  today: SnapshotServiceEntry[],
  diff: DigestDiff | null,
  dateKey: string,
): string {
  const monitorable = today.filter((s) => s.healthy !== undefined);
  const healthy = monitorable.filter((s) => s.healthy).length;
  const failing = monitorable.filter((s) => !s.healthy).length;
  const total = monitorable.length;

  const lines: string[] = [
    `🖥 <b>Monitoring Daily Digest</b> — ${dateKey}`,
    '',
    `📊 Summary: ${healthy} healthy / ${failing} failing / ${total} total`,
    '',
    '━━━━━━━━━━━━━━━━━━━━',
  ];

  if (!diff) {
    lines.push('ℹ️ <b>First run — no previous snapshot to compare</b>');
  } else {
    const hasChanges = diff.newlyFailing.length > 0 || diff.recovered.length > 0;
    if (!hasChanges) {
      lines.push('✅ No changes since yesterday');
    } else {
      lines.push('<b>⚠️ CHANGES SINCE YESTERDAY</b>');
      if (diff.newlyFailing.length > 0) {
        lines.push(`<b>⬇️ Newly failing (${diff.newlyFailing.length}):</b>`);
        for (const s of diff.newlyFailing) {
          lines.push(`<b>• ${s.name}${s.error ? ` — ${s.error}` : ''}</b>`);
        }
      }
      if (diff.recovered.length > 0) {
        lines.push(`<b>✅ Recovered (${diff.recovered.length}):</b>`);
        for (const s of diff.recovered) {
          lines.push(`<b>• ${s.name}</b>`);
        }
      }
    }
  }

  const currentlyFailing = today.filter((s) => !s.healthy);
  if (currentlyFailing.length > 0) {
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push(`🔴 Still failing (${currentlyFailing.length}):`);
    for (const s of currentlyFailing) {
      lines.push(`• ${s.name}${s.error ? ` — ${s.error}` : ''}`);
    }
  } else {
    lines.push('');
    lines.push('✅ All services healthy');
  }

  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest src/digest/digest.utils.spec.ts --no-coverage 2>&1 | tail -15
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/digest/digest.utils.ts src/digest/digest.utils.spec.ts
git commit -m "feat(digest): add diff computation and Telegram message formatting utils"
```

---

## Task 4: NotificationsClient

**Files:**
- Create: `src/common/notifications/notifications.client.ts`

- [ ] **Step 1: Create the client**

```typescript
// src/common/notifications/notifications.client.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class NotificationsClient {
  private readonly logger = new Logger(NotificationsClient.name);
  private http: AxiosInstance;
  private telegramChatId: string;

  constructor(private readonly config: ConfigService) {
    const url = config.get<string>('notifications.url') || 'http://notifications-microservice:3368';
    const token = config.get<string>('digest.notificationsToken') || '';
    this.telegramChatId = config.get<string>('digest.telegramChatId') || '';

    this.http = axios.create({
      baseURL: url,
      timeout: 8000,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  }

  async sendTelegram(message: string): Promise<void> {
    if (!this.telegramChatId) {
      this.logger.warn('[NotificationsClient] TELEGRAM_CHAT_ID not set — skipping send');
      return;
    }
    await this.http.post('/notifications/send', {
      channel: 'telegram',
      type: 'custom',
      recipient: this.telegramChatId,
      message,
      service: 'monitoring-microservice',
    });
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/common/notifications/notifications.client.ts
git commit -m "feat(digest): add NotificationsClient for Telegram dispatch"
```

---

## Task 5: DailyDigestService

**Files:**
- Create: `src/digest/daily-digest.service.ts`

- [ ] **Step 1: Create the service**

```typescript
// src/digest/daily-digest.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ServicesService } from '../services/services.service';
import { NotificationsClient } from '../common/notifications/notifications.client';
import { LoggingService } from '../common/logging/logging.service';
import { ServiceHealthSnapshot, SnapshotServiceEntry } from './service-health-snapshot.entity';
import { computeDiff, formatDigestMessage } from './digest.utils';

const CRON = process.env.DAILY_DIGEST_CRON || '0 8 * * *';

@Injectable()
export class DailyDigestService {
  private readonly logger = new Logger(DailyDigestService.name);

  constructor(
    @InjectRepository(ServiceHealthSnapshot)
    private readonly snapshotRepo: Repository<ServiceHealthSnapshot>,
    private readonly servicesService: ServicesService,
    private readonly notifications: NotificationsClient,
    private readonly logging: LoggingService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CRON)
  async sendMorningDigest(): Promise<void> {
    if (this.config.get<boolean>('digest.enabled') === false) return;
    await this.runDigest();
  }

  async runDigest(): Promise<void> {
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const yesterdayKey = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);

    try {
      const statuses = await this.servicesService.getServicesStatus();
      const todayEntries: SnapshotServiceEntry[] = statuses
        .filter((s) => s.monitorable)
        .map((s) => ({ name: s.name, healthy: s.healthy, responseTimeMs: s.responseTimeMs, error: s.error }));

      const yesterdaySnapshot = await this.snapshotRepo.findOne({
        where: { snapshotDate: yesterdayKey },
      });

      const diff = computeDiff(todayEntries, yesterdaySnapshot?.services ?? null);
      const message = formatDigestMessage(todayEntries, diff, todayKey);

      await this.snapshotRepo.upsert(
        { snapshotDate: todayKey, services: todayEntries },
        { conflictPaths: ['snapshotDate'] },
      );

      await this.notifications.sendTelegram(message);

      await this.logging.log('info', 'daily_digest_sent', {
        date: todayKey,
        total: todayEntries.length,
        failing: todayEntries.filter((s) => !s.healthy).length,
        newlyFailing: diff?.newlyFailing.length ?? 0,
        recovered: diff?.recovered.length ?? 0,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[DailyDigestService] digest failed: ${msg}`);
      await this.logging.log('error', 'daily_digest_failed', { date: todayKey, error: msg });
    }
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/digest/daily-digest.service.ts
git commit -m "feat(digest): add DailyDigestService with cron and snapshot upsert"
```

---

## Task 6: DigestModule

**Files:**
- Create: `src/digest/digest.module.ts`

- [ ] **Step 1: Create the module**

```typescript
// src/digest/digest.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceHealthSnapshot } from './service-health-snapshot.entity';
import { DailyDigestService } from './daily-digest.service';
import { ServicesModule } from '../services/services.module';
import { NotificationsClient } from '../common/notifications/notifications.client';
import { LoggingService } from '../common/logging/logging.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ServiceHealthSnapshot]),
    ServicesModule,
  ],
  providers: [DailyDigestService, NotificationsClient, LoggingService],
})
export class DigestModule {}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/digest/digest.module.ts
git commit -m "feat(digest): add DigestModule"
```

---

## Task 7: Wire AppModule + configuration.ts

**Files:**
- Modify: `src/app.module.ts`
- Modify: `src/config/configuration.ts`

- [ ] **Step 1: Add DigestModule to AppModule**

In `src/app.module.ts`, add the import:

```typescript
import { DigestModule } from './digest/digest.module';
```

Add `DigestModule` to the `imports` array after `WebhooksModule`:

```typescript
imports: [
  ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
  ScheduleModule.forRoot(),
  TypeOrmModule.forRootAsync({ ... }),
  AlertsModule,
  ServicesModule,
  WebhooksModule,
  DigestModule,   // <-- add this line
],
```

- [ ] **Step 2: Add digest config block to configuration.ts**

In `src/config/configuration.ts`, add at the end of the exported object:

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
npm run build 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Run the full test suite**

```bash
npm run test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app.module.ts src/config/configuration.ts
git commit -m "feat(digest): wire DigestModule into AppModule and add config"
```

---

## Task 8: K8s Manifests

**Files:**
- Modify: `k8s/configmap.yaml`
- Modify: `k8s/external-secret.yaml`

- [ ] **Step 1: Add env vars to configmap.yaml**

In `k8s/configmap.yaml`, add inside the `data:` block:

```yaml
  DAILY_DIGEST_ENABLED: "true"
  DAILY_DIGEST_CRON: "0 8 * * *"
  TELEGRAM_CHAT_ID: ""
```

Replace `""` for `TELEGRAM_CHAT_ID` with your actual Telegram chat ID (the numeric ID of the chat where you want the digest sent — same value used in `runlayer`).

- [ ] **Step 2: Add secret to external-secret.yaml**

In `k8s/external-secret.yaml`, add inside the `spec.data:` array:

- [ ] **Step 3: Add the secret to Vault**

To find the correct token value, check how other services authenticate to notifications-microservice:

```bash
kubectl -n statex-apps exec deployment/monitoring-microservice -- \
  env | grep NOTIFICATION
```

- [ ] **Step 4: Commit**

```bash
git add k8s/configmap.yaml k8s/external-secret.yaml
git commit -m "feat(digest): add Telegram + digest env vars to K8s manifests"
```

---

## Task 9: Deploy and Smoke Test

- [ ] **Step 1: Build and push the Docker image**

```bash
docker build -t <registry>/monitoring-microservice:latest .
docker push <registry>/monitoring-microservice:latest
```

- [ ] **Step 2: Apply updated K8s manifests**

```bash
kubectl -n statex-apps apply -f k8s/configmap.yaml
kubectl -n statex-apps apply -f k8s/external-secret.yaml
kubectl -n statex-apps rollout restart deployment/monitoring-microservice
kubectl -n statex-apps rollout status deployment/monitoring-microservice
```

- [ ] **Step 3: Trigger the digest manually to verify end-to-end**

The service exposes no HTTP trigger for the cron by default. Trigger it via a temporary test endpoint or verify via logs after waiting for the cron, OR call `runDigest()` directly by adding a temporary `POST /api/digest/trigger` endpoint:

Alternatively, verify by exec-ing into the pod and checking the scheduled cron is registered:

```bash
kubectl -n statex-apps logs deployment/monitoring-microservice --tail=50 | grep -i digest
```

Expected log line on startup: NestJS schedule registration message for `DailyDigestService`.

- [ ] **Step 4: (Optional) Add manual trigger endpoint for testing**

If you want to trigger the digest immediately without waiting for 8 AM, add this temporary controller:

```typescript
// src/digest/digest.controller.ts  (delete after testing)
import { Controller, Post } from '@nestjs/common';
import { DailyDigestService } from './daily-digest.service';

@Controller('api/digest')
export class DigestController {
  constructor(private readonly digest: DailyDigestService) {}

  @Post('trigger')
  async trigger() {
    await this.digest.runDigest();
    return { ok: true };
  }
}
```

Add `DigestController` to `DigestModule.controllers`, redeploy, then:

```bash
curl -X POST https://monitoring.alfares.cz/api/digest/trigger
```

Check your Telegram for the message.

- [ ] **Step 5: Verify Telegram message received**

Confirm the digest arrives in your Telegram chat with:
- Correct date header
- Summary counts
- Bold changes section (or "First run" on first execution)
- List of failing services

- [ ] **Step 6: Remove temporary trigger endpoint if added**

Delete `src/digest/digest.controller.ts`, remove from `DigestModule.controllers`, rebuild and redeploy.

---

## Self-Review Checklist

- [x] **Spec coverage:** Entity ✓, diff logic ✓, message format ✓, cron ✓, snapshot upsert ✓, notifications client ✓, first-run edge case ✓, no-changes edge case ✓, K8s env vars ✓
- [x] **No placeholders:** All steps have complete code
- [x] **Type consistency:** `SnapshotServiceEntry` defined in entity, imported correctly in utils and service. `computeDiff` returns `DigestDiff | null`. `formatDigestMessage` accepts `DigestDiff | null`. `runDigest()` is public for manual trigger.
- [x] **TELEGRAM_CHAT_ID note:** Reminder in Task 8 Step 1 to fill in the actual value
- [x] **Vault token:** Task 8 Step 3 explains how to find the correct token value
