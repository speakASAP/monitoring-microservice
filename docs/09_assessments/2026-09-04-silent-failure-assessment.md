# Silent-failure assessment: CronJob/Job and error-log alerting

- **Date:** 2026-09-04
- **Type:** Research / assessment only. **No code, config, or cluster state was changed.**
- **Status:** DRAFT — for multi-agent review before any planning or implementation.
- **Scope:** Why `catalog-contract-monitor` failed for 3+ days with zero alerts; what
  scheduled work exists ecosystem-wide; what monitoring/logging/notifications can and
  cannot do today; where an alert-and-remediate loop should be built.
- **Requested outcome (owner):** find errors ASAP and address them ASAP; build it on
  `monitoring-microservice` using `logging-microservice`; **no new applications**.

Convention: `[UNKNOWN: ...]` marks a fact not established. `[VERIFY]` marks a claim that
a reviewer should re-confirm before it is used as a planning premise.

---

## 1. Executive summary

Nine things run on a schedule in Kubernetes. **Nothing watches whether any of them
succeeded.** `HealthWatcher` in `monitoring-microservice` polls `/health` on 60
long-running services every 5 minutes and alerts to Telegram on failure. A CronJob has no
`/health` endpoint, is not in the service registry, and is therefore invisible to the only
runtime watcher the ecosystem has.

The gap became load-bearing on **2026-08-27**, when the Prometheus /
kube-state-metrics / Alertmanager stack was deliberately retired
(`3023d84`, `2865e1a`, `087d08c` in `monitoring-microservice`). That stack had covered
Job/CronJob failure implicitly. Its removal was intentional and the owner has said it must
not be reinstated — but the CronJob coverage it provided was never replaced. Five days
later a real failure landed in the uncovered area and went unheard.

`catalog-contract-monitor` has failed **every 30 minutes since 2026-09-01T07:44Z**.
That is roughly **154 scheduled runs / ~616 failed pod executions** in 77 hours, producing
**zero alerts**. Its purpose is to detect catalog contract breakage. It detected the
breakage correctly on the first run and exited 1 every time since. The detection worked;
only the reporting was missing.

Three assets already exist and should be reused rather than rebuilt:

1. A **working alert engine** in `monitoring-microservice` (`monitoring.alerts` table,
   fingerprint dedup, flap damping, repeat backoff, deferred recovery).
2. A **working Telegram delivery path** in production
   (`notifications-microservice` `POST /notifications/send`), already reused by
   monitoring's digest, the deploy queue, and the token-health guard.
3. A **working precedent for exactly this class of guard**:
   `shared/scripts/token-health/token-health-guard.sh`, which was built after seven
   credentials expired unnoticed, and which alerted correctly this morning.

The missing pieces are narrow: a **Job/CronJob outcome source**, an **error-log query
source**, and a decision on **whether and how to close the loop to automated repair**.

---

## 2. Authentication finding

The prior probe depended on a legacy static credential and self-asserted caller
identity. That path is not a valid remediation or monitoring contract. The
CronJob requires its own Auth-registered caller-to-catalog-microservice RS256
principal, delivered through Vault -> ExternalSecret -> Kubernetes Secret ->
secretKeyRef, and its rotation must prove catalog acceptance. The required
receiver enforcement and route role are governed solely by
auth-microservice/docs/SERVICE_IDENTITY_CONSUMER_STANDARD.md. The required
runtime remediation is outside this assessment and remains unimplemented.

## 3. Inventory: what runs on a schedule

### 3.1 Kubernetes CronJobs — 11 live in `statex-apps`

Measured 2026-09-04 ~12:45 UTC.

| CronJob | Schedule | Last success | Owning repo |
| --- | --- | --- | --- |
| `catalog-contract-monitor` | `14,44 * * * *` | **77.3h ago — BROKEN** | catalog-microservice |
| `cliplot-readiness-monitor` | `19,49 * * * *` | 0.1h ago (one 155m failure earlier today) | cliplot |
| `domain-research-expiry-recheck` | `2-57/5 * * * *` | 0.0h ago | domain-research |
| `domain-research-notification-dispatch` | `9-59/15 * * * *` | 0.1h ago | domain-research |
| `marketing-order-affinity-allegro-daily` | `23 2 * * *` | 10.1h ago | marketing-microservice |
| `marketing-order-affinity-aukro-daily` | `50 14 * * *` | 23.6h ago (failed run 7d23h ago) | marketing-microservice |
| `marketing-order-affinity-bazos-daily` | `0 23 * * *` | 15.5h ago (failed run 4d15h ago) | marketing-microservice |
| `marketing-order-affinity-central-orders-backfill` | `20 3 * * *` | 9.2h ago (failed run 6d9h ago) | marketing-microservice |
| `pod-janitor` | `*/15 * * * *` | 0.2h ago | k8s-manifests |
| `speakasap-lesson-record-sync` | `20 2 * * *` | 10.2h ago | speakasap |
| `warehouse-reservation-expiry` | `3-58/5 * * * *` | 0.0h ago (failed run 7d19h ago) | warehouse-microservice |

Only one is persistently broken. But **four others have had failed runs in the last eight
days that also produced no alert** — they simply recovered on the next schedule. A
transient-vs-persistent distinction must be a design input, or the channel will be noisy.

Note the composition: five of the eleven are themselves **monitors**
(`catalog-contract-monitor`, `cliplot-readiness-monitor`,
`domain-research-expiry-recheck`, plus arguably the janitor and the dispatch job). The
ecosystem's watchdogs are unwatched. `catalog-contract-monitor` failing silently is
strictly worse than an ordinary job failing silently, because its own silence was the
thing that was supposed to be impossible.

### 3.2 Host-level scheduled work (outside Kubernetes)

**crontab (`crontab -l`)** — 4 entries:

| Schedule | Job |
| --- | --- |
| `0 4 * * 0` | `shared/scripts/docker-prune-cron.sh` under the deploy mutex |
| `15 3 * * *` | `shared/scripts/rotate-logging-admin-token.sh` |
| `45 3 * * *` | `logging-microservice/scripts/check-ingest-staleness.sh` — **alerts Telegram on stale senders** |
| `0 2 * * *` | `database-server/scripts/backup-all-databases.sh` |

**systemd user timers** (rootless, `~/.config/systemd/user`, `loginctl enable-linger ssf`):

| Timer | Time | Purpose |
| --- | --- | --- |
| `vault-eso-token-renew` | 00:04 | Vault/ESO token renewal |
| `ips-ecosystem-validator` | 05:45 | IPS adoption validation + STATE.json drift healing |
| `next-tasks-scan` | 06:15 | Ecosystem-wide next-task projection |
| `statex-token-health` | 07:15 | **Credential expiry guard → Telegram** |
| `statex-ecosystem-digest` | 08:00 | **Daily digest → Telegram** |

Plus the path-activated `statex-deploy-queue.path`/`.service` worker.

**These host jobs are also unwatched as a class**, with one exception:
`statex-token-health.service` declares
`OnFailure=statex-token-health-failure.service`, which pages Telegram when the unit itself
dies. Its own header records why: *"four scheduled runs of the system unit died on an
unwritable state directory without a word reaching anyone."* That is the same failure mode
as the present incident, already suffered once, already solved once — **for one unit
only**. None of the four crontab entries and none of the other four timers have an
equivalent. `[VERIFY]` whether extending `OnFailure=` to the remaining units is in scope
or a separate lane.

### 3.3 Evidence is destroyed within ~2 hours

`k8s-manifests/services/pod-janitor.yaml` runs every 15 minutes with
`KEEP_FAILED_MINUTES=120`, deleting failed pods older than 2h (it correctly skips pods of
still-active Jobs). `catalog-contract-monitor` additionally sets
`failedJobsHistoryLimit: 1`, so only the most recent failed Job survives.

Consequences for any design:

- A poller running less often than every ~2 hours **will miss failures entirely**.
- An alert must **capture the log tail at detection time**; a link or a "go look at the
  pod" message will be dead on arrival.
- The historical question "how long has this been broken?" is answerable **only** from
  `CronJob.status.lastSuccessfulTime`, which the janitor does not touch. That field is the
  most reliable available signal and should probably be the primary one.

`pod-janitor` is also the ecosystem's existing precedent for a workload with cluster read
access: it has a ServiceAccount, ClusterRole and ClusterRoleBinding granting
`pods: get/list/delete`, **`batch/jobs: get/list`**, and `nodes: get/list`. A Job-watching
role already exists in a reviewed manifest and can be modelled on.

---

## 4. Current capability: what exists and works

### 4.1 monitoring-microservice — alert engine present, sources absent

NestJS + TypeORM, Postgres schema `monitoring`. API `monitoring-microservice` :3395,
dashboard `monitoring-web` :3396, both `1/1 Running` on image `3023d84`.

**Works today:**

- `monitoring.alerts` table (`src/alerts/alerts.entity.ts`) with
  `alertname, service, severity, message, status, labels, fingerprint,
  occurrenceCount, lastFiredAt, resolvedAt, pendingResolveSince, flapCount,
  lastNotifiedAt, acknowledgedBy/At`, and a unique-active index on `fingerprint`.
- `AlertsService.fire()` / `resolve()` with fingerprint-keyed dedup.
- `alert-policy.ts`: flap damping (`ALERT_FLAP_WINDOW_MINUTES`, default 10) and
  escalating repeat backoff (`REPEAT_BACKOFF_MINUTES = [15,30,60,120,240]`).
- `AlertSweeper` — announces recovery only after the flap window is quiet.
- `HealthWatcher` (`src/alerts/health-watcher.ts`) — `@Cron(HEALTH_WATCH_CRON)`,
  live value `*/5 * * * *`, iterates `ECOSYSTEM_SERVICES`
  (`src/config/ecosystem-services.ts`, ~60 entries), GETs each `healthPath`
  (default `/health`) at `http://<name>.statex-apps.svc.cluster.local:<port>`,
  fires `health:<service>` and sends Telegram on failure. It distinguishes a
  `'config'` failure kind (registry misconfiguration — logged, never alerted) from a real
  outage.
- REST surface: `GET /api/alerts`, `POST /api/alerts/fire`, `POST /api/alerts/resolve`,
  `POST /api/alerts`, `POST /api/alerts/:id/acknowledge`, `POST /api/alerts/:id/resolve`.
- `NotificationsClient.sendTelegram()`
  (`src/common/notifications/notifications.client.ts`) → `POST /notifications/send`.
- `CredentialWatcher` / `credential-self-reporter` — credential expiry reconciliation.
- `DailyDigestService` at `DAILY_DIGEST_CRON = 0 8 * * *`.

**Absent today:**

- **No Kubernetes client at all.** No `@kubernetes/client-node` dependency; a grep for
  `Kubernetes|k8s|CronJob|kube` across `src/` returns only a registry entry named
  `'k8s-manifests'` and a historical comment. `k8s/` contains `configmap.yaml`,
  `deployment.yaml`, `deployment-web.yaml`, `external-secret.yaml`, `ingress.yaml`,
  `service.yaml`, `service-web.yaml` — **no ServiceAccount, Role, ClusterRole or
  RoleBinding**. Reading Job status would require new RBAC, which is a security-review
  surface, not a code change.
- **No log consumption.** `src/common/logging` only *emits* to logging-microservice.
- **No metrics source.** The Prometheus stack was removed on 2026-08-27 and per
  `087d08c` the owner has directed that it not be reinstated.
- **No remediation** of any kind.

**Already self-identified.** `monitoring-microservice/TASKS.md:123-138` states:

> *"The CronJob/Job coverage gap below is now unambiguously this service's to close, since
> nothing else will. **Coverage gap this exposed: nothing watches CronJobs.**
> `HealthWatcher` polls registered service `/health` endpoints only; there is no Job or
> CronJob failure path anywhere in the service. While the Prometheus stack existed it
> covered that implicitly. It no longer does..."*

`STATE.json` shows `active_goal_ids: ["GOAL-IMPACT-TASK-005"]` (alert noise reduction),
whose first delivery — flap damping and repeat backoff, `284c9b8` — is deployed and
verified. **The CronJob gap is named and owned but no code exists for it.** This
assessment corroborates that record rather than discovering something new; the value added
here is the ecosystem-wide inventory, the evidence-retention constraint, and the
logging-side findings below.

### 4.2 logging-microservice — a weaker foundation than the brief assumes

NestJS + Winston + `winston-daily-rotate-file`, :3367, `1/1 Running`, image `4714e2e`.

**Ingest:** `POST /api/logs` (`src/logs/logs.controller.ts:15-20`, `LogIngestGuard`).
Entry schema (`src/logs/dto/log-entry.dto.ts`): `level` (error/warn/info/debug),
`message`/`msg`, `service` (required), `timestamp`, `task_id`, `tenant_id`, `project_id`,
`business_id`, `agent_id`, `correlation_id`, `duration_ms`, `metadata`.

**Query:** `GET /api/logs/query` (`AdminRoleGuard`) — `service, level, startDate, endDate,
limit, task_id, project_id, correlation_id, q`. Also `/api/logs/services`,
`/api/logs/coverage`, and a tenant-scoped `/api/v1/customer/logs` family with cursor
pagination and PII redaction.

**Five constraints that materially affect any design built on it:**

1. **Opt-in HTTP only. There is no log collector.** `kubectl get daemonset -A` returns
   *"No resources found"*. There is no Fluent Bit, Vector or Promtail. A service's logs
   reach logging-microservice **only if its application code POSTs them**.
   `ADR-001-file-based-rotated-log-storage.md` records this as a deliberate decision.
   **Therefore CronJob stdout/stderr — including every line of the
   `catalog-contract-monitor` failure — never reaches logging-microservice.** A
   log-watching alerter reading this service would **not** have caught this incident.
   This is the single most important finding for the owner's stated preferred approach.
3. **No push, no stream.** No WebSocket, SSE, or webhook anywhere in `src/`. Any consumer
   must poll `GET /api/logs/query`.
4. **No index; files, not a database.** Queries are `readdirSync` + line-by-line
   `JSON.parse` over per-service `.log` files on a PVC (~3.9 GB observed). There is no
   index on `level`, `timestamp` or `service`. Polling for errors across all services at
   short intervals is an O(n) full scan each time — a real performance question, not a
   detail.
5. **No error-detection primitives.** No fingerprinting, grouping, counts-over-time,
   anomaly detection, alert rules, or "unacknowledged" state. The only existing detector is
   `getCoverage()` — **sender liveness**, not log content — with `LOG_STALE_AFTER_HOURS`
   (default 24), driven by the 03:45 crontab entry into Telegram. That mechanism exists
   *because of the same class of incident*: on 2026-07-06 ingest auth was enforced without
   distributing credentials, eleven services stopped shipping, and it went unnoticed for
   six weeks.

**Implication.** The owner's instruction — *"better to implement it on the
monitoring-microservice side using logs-microservice"* — is directionally right about the
owner (monitoring) but **logging-microservice cannot be the primary source for job
failures**, because job output never enters it. Reviewers should treat "which source"
as the central open question of the planning phase (see §7.1).

### 4.3 notifications-microservice — delivery is solved

NestJS + TypeORM + Postgres, :3368, `1/1 Running`.

- `POST /notifications/send` with `{channel:"telegram", type, recipient, message, service}`.
- `src/telegram/telegram.service.ts:107-224` → `https://api.telegram.org/bot<token>/sendMessage`.
  Defaults to **plain text** parse mode and retries once as plain text if Telegram rejects
  parsing — chosen so a stray `<` in a log tail cannot destroy an alert. Truncates at
  Telegram's 4096-char limit rather than dropping.
- Bot token: Vault `secret/prod/notifications-microservice` → `TELEGRAM_BOT_TOKEN` via
  ExternalSecret (`k8s/external-secret.yaml:71-75`).
- Chat ID: `TELEGRAM_CHAT_ID` in `k8s/configmap.yaml` — a **single owner chat**.
- Persisted `Notification` entity with status, `GET /notifications/history`, 5-minute
  idempotency dedupe, and a `ChannelRegistry` policy layer for caller/purpose scoping.
- Also supports email (SES/SendGrid) and WhatsApp.
- No outbound rate limiting and no outbound DLQ; a send is synchronous HTTP and a failure
  throws.

Existing ops consumers, all working: monitoring's `HealthWatcher` + daily digest;
`shared/scripts/deploy-queue/notify.sh` (used by `worker.sh:112/133/177` for
`✅ RESOLVED` / `🐢 Deploy SLOW` / `🚨 Deploy FAILED`); `token-health-guard.sh`;
`ecosystem-digest.sh`; `check-ingest-staleness.sh`.

`notify.sh` borrows monitoring's chat ID and per-caller token by reading them from the
running monitoring pod, deliberately rather than minting a second credential, *"so
rotating it cannot leave this notifier silently posting to a dead chat."* Any new alerter
should follow the same rule.

**Delivery is not a gap.** It is a solved, reused, single-owner path.

### 4.4 The daily digest does not cover runtime

`shared/scripts/ecosystem-digest.sh` (33 lines) pipes
`ecosystem-progress-report.py --telegram-summary` into `deploy_queue_notify`. That script
(288 lines) reads only `TASKS.md`, `STATE.json`, plan front-matter and checkbox counts. It
**never calls kubectl** and reports no runtime state whatsoever. It ran successfully at
08:00 on both 2026-09-03 and 2026-09-04 and said nothing about the broken CronJob, because
it structurally cannot. A daily heartbeat that is green while production is red is worse
than no heartbeat, since it is read as reassurance.

Note the split-brain: `monitoring-microservice` has its own `DailyDigestService` at
`DAILY_DIGEST_CRON = 0 8 * * *` **and** the host runs `statex-ecosystem-digest.timer` at
08:00, both posting to the same Telegram chat. `[UNKNOWN: whether these are two distinct
messages by design or an unintended duplication]` — worth resolving in planning, since
adding a third daily sender to the same chat compounds it.

### 4.5 token-health — the model to copy

`shared/scripts/token-health/token-health-guard.sh` (157 lines) is the closest existing
thing to what is being asked for, and its design decisions are already reasoned and
battle-tested:

- **Alert on transitions, not standing state.** *"38 HS256 mounts exist today... re-sending
  all of them daily would bury the channel, and a channel people mute is worse than no
  channel at all. The report is where you read current state; the guard tells you when it
  got worse."*
- **Deadlines re-alert every run.** *"A token 3 days out that was 4 days out yesterday is
  not 'no news', it is a deadline."* (`TOKEN_HEALTH_URGENT_DAYS`, default 7.)
- **Baseline diff in `$XDG_STATE_HOME`**, keyed on `app|var` and explicitly *not* on the
  value fingerprint, so a legitimate rotation is not reported as a new finding.
- **Distinct exit codes:** `0` no regression, `1` findings delivered, `2` operational
  failure. `SuccessExitStatus=0 1` in the unit, so a finding is not a red unit but a broken
  audit is.
- **No silent failures, stated as a contract:** *"if the audit cannot run, that is an
  error, not 'nothing to report'. If the alert cannot be delivered, that is an error too —
  a finding nobody hears about is the exact silent failure this guard exists to prevent."*
  It refuses to treat an audit failure as a clean bill of health, and prints the
  undelivered message to stderr when Telegram is unreachable.
- **`OnFailure=` unit** so the guard's own death pages the same channel.
- **Security contract:** token values are never printed, logged, written to disk or placed
  in argv; only `sha256(value)[0:8]` and decoded non-secret claims leave the script.

Evidence it works: journal shows `no regressions (176/177/185 mounts audited)` on
Aug 31 / Sep 1 / Sep 3, `11 findings reported to Telegram` on Sep 2, and `1 findings
reported to Telegram` on Sep 4 — the catalog `JWT_TOKEN` crossing into the 7-day window.

A CronJob guard is the same shape with a different audit function. **This is a strong
argument that the state-diff/transition model, not a raw event stream, is the right
semantics** — and it is already understood by the people who will review this.

---

## 5. Why the failure was silent — five independent reasons

Each of these alone was sufficient. All five held simultaneously.

1. **No watcher.** `HealthWatcher` covers `/health` on registered long-running services.
   A CronJob has no `/health`, is not in `ECOSYSTEM_SERVICES`, and monitoring holds no
   Kubernetes credentials to see it by any other means.
2. **The signal never left the pod.** The monitor writes a JSON summary to stdout and sets
   `process.exitCode = 1` (`catalog-contract-monitor.js:180-183`). It calls no notifier,
   posts to no API, and writes to no log service. Its own failure report is addressed to
   nobody. Because there is no DaemonSet collector, stdout is not forwarded either.
3. **The evidence self-destructs.** `pod-janitor` deletes failed pods after 120 minutes;
   `failedJobsHistoryLimit: 1` keeps one failed Job. After ~2h nothing remains except
   `lastSuccessfulTime`.
4. **The heartbeat is blind.** The 08:00 digest reports planning documents only and was
   green throughout.
5. **The implicit safety net was removed.** The Prometheus/kube-state-metrics stack was
   retired 2026-08-27 — a deliberate, endorsed decision — but the CronJob coverage it
   incidentally provided was not re-homed. The gap opened on 08-27 and was occupied on 09-01.

A sixth, softer reason: `exitCode 1` was the *correct* behaviour of a *working* detector.
Nothing in the system was malfunctioning except the absence of a listener. Every component
did exactly what it was written to do.

---

## 6. Automated remediation: what actually exists

This is the least-understood half of the request and the part most likely to be
over-scoped, so it is separated into what is wired and running versus what is not.

### 6.1 runlayer — real, deployed, and more capable than expected

`runlayer-6b857cd8bc-x8jbc` `1/1 Running`, ClusterIP :3390. Working code paths:

- `src/coding-worker/coding-worker-agent.service.ts` — dispatches a **Claude Code CLI
  job** to ai-microservice (`POST ${aiUrl}/ai/claude-code-execute`, ~line 321), builds
  agent instructions ("You are an autonomous coding agent running inside an isolated
  worktree", ~line 471), polls job status, applies diffs to a repo worktree. Providers:
  `claude-code | openrouter | litellm | ollama | codex`. Guarded by a **blacklist** on
  `task.targetService` (line 69-74, `codingAgent.blacklist`) which throws before dispatch.
- `src/goal-review/goal-review.service.ts:109-133` — on verdict `needs_improvement`,
  shells out to real `gh issue create --repo ... --label cc-review,automated` and
  `gh pr create`.
- `src/goals/goal-github-tracker.service.ts` — `ensureIssueForGoal` / `closeIssueForGoal`
  driven by goal lifecycle (`goals.service.ts:211,400,454`).
- `src/coordinator/self-healing.service.ts` — `@Cron(EVERY_MINUTE) detectStuckTasks()`,
  20-minute stuck threshold, `LOOPING_GOAL_CYCLE_LIMIT = 5`, alerts via
  `NotificationsClient`.
- Escalation API with `acknowledge` / `resolve`; dashboard actions
  `tasks/:id/{approve,reject,answer,retry,comment}`.

**Programmatic entry point:** `POST /projects/:projectId/goals`
(`src/goals/goals.controller.ts:42`) exists. The tasks controller exposes only `GET`
(`tasks.controller.ts:15,44`) — tasks appear to be derived from goals rather than created
directly. So the natural machine-driven entry is **goal creation**, not task creation.
`[VERIFY]` the auth requirements, request schema, and idempotency semantics of that
endpoint before treating it as the integration seam.

### 6.2 What is missing for a closed loop

**No infrastructure alert anywhere currently triggers anything except a Telegram message
to a human.** No path was found from monitoring, logging, notifications, or the deploy
queue into runlayer goal creation or coding-agent dispatch. runlayer's automation is
goal/project-driven from within its own domain.

So the loop is: `detect → Telegram → human reads → human acts`. The owner wants
`detect → alert → begin fixing`. The **detect** and **alert** halves have working
machinery. The **begin fixing** half requires one new integration between two existing,
deployed services — not a new application, which matches the owner's constraint.

### 6.3 Risks a reviewer must weigh before endorsing auto-fix

- **The trigger case is a counter-example to naive auto-fix.** The correct remedy here is
  a *security allowlist change* in `catalog-microservice` — deciding that
  `catalog-contract-monitor` is a legitimate caller and what roles it should hold. That is
  precisely the judgement `b99a38c` and `3fb296a` were written to force a human to make.
  An agent that "fixes the 401" by widening an allowlist would be undoing a deliberate
  security hardening. **A blanket auto-fix policy would have made this incident worse.**
- Two of the three catalog auth commits are `fix(security)`. The blast radius of an
  automated change on that surface is the whole catalog.
- `AGENTS.md` states subagents stop at the deployment boundary and that deployment is
  serialized by a single lock. An auto-fix loop that commits would enqueue deploys through
  `scripts/deploy-queue/registry.sh`, interacting with a mutex whose contention behaviour
  under machine-generated load is untested. `[UNKNOWN: behaviour of the deploy queue under
  repeated agent-generated commits]`
- A flapping detector wired to a coding agent could open duplicate issues or PRs on every
  cycle. runlayer's `LOOPING_GOAL_CYCLE_LIMIT` and monitoring's fingerprint dedup both
  exist but have never been composed.
- The blacklist in `coding-worker-agent.service.ts` is the existing containment primitive
  and its current contents should be read before any design assumes agent reach.

A defensible middle position for reviewers to consider: **triage automatically, repair
under gate.** Alert → auto-create a runlayer goal / GitHub issue with the captured
evidence → agent produces a diff and a PR → a human approves the merge. That closes the
"nobody knows" gap and most of the "nobody starts" gap while keeping a human on security
surfaces. It is also the only variant that reuses `goal-review.service.ts`'s existing
`gh pr create` path rather than inventing one.

---

## 7. Open questions for the reviewing agents

These are deliberately left unresolved. This document is an assessment, not a plan.

### 7.1 Source of truth for job outcomes — the central question

Three candidates, none free:

| Option | Mechanism | Cost | Notes |
| --- | --- | --- | --- |
| **A. Kubernetes API** | monitoring polls `batch/jobs` + `CronJob.status.lastSuccessfulTime` | New ServiceAccount + ClusterRole + RoleBinding; new K8s client dependency | Only source that sees the actual failure. `pod-janitor` is an existing reviewed RBAC precedent (`batch/jobs: get/list`). Survives the janitor because `lastSuccessfulTime` is not deleted. |
| **B. Jobs self-report** | each CronJob POSTs its outcome to logging- or monitoring-microservice | Edits in 8 repos; a job that dies before reporting reports nothing | Matches logging's opt-in architecture but **cannot detect a crash, OOM, image-pull failure, or a job that never started** — arguably the failures that matter most. |
| **C. Host-side guard** | a `token-health`-shaped script on a systemd timer using the node's kubectl | Lowest new-surface; no RBAC, no code, no deploy | Proven pattern, but lives outside monitoring-microservice, which conflicts with the owner's stated placement and with `TASKS.md`'s ownership claim. |

The owner asked for monitoring + logging. **Logging alone cannot serve** (§4.2, point 1).
A likely resolution is A for job outcomes and logging for error-content signals once
coverage is repaired — but that is a planning decision. `[VERIFY]` whether granting
monitoring-microservice cluster read access is acceptable to the owner; it is the main new
security surface in this whole area.

### 7.2 Detection semantics

- Transition-based (token-health model) or event-based? Transition-based is proven here
  and is the only model that survives 154 identical failures without burying the channel.
- What is the alert condition? `lastSuccessfulTime` older than N × schedule interval seems
  natural and is janitor-proof; a raw "a Job failed" trigger would have fired for four
  transient failures in eight days.
- Consecutive-failure threshold before alerting, to separate persistent from transient?
- Re-alert cadence for a standing failure — reuse `REPEAT_BACKOFF_MINUTES`?
- Poll interval must be well under `KEEP_FAILED_MINUTES=120` if pod logs are to be
  captured as evidence.

### 7.3 Scope

- CronJobs only, or all `batch/jobs` including one-off migration Jobs?
- Does host-level scheduled work (§3.2) come into the same system, or is
  `OnFailure=` on the remaining timers a separate, cheaper lane?
- Should `catalog-contract-monitor` — and the other four monitor-CronJobs — additionally
  report their own results somewhere, so that a *result* is distinguishable from a
  *run*? A job can exit 0 and still have found a problem.
- Is repairing logging ingestion (11 services silent, active `missing_credential`
  rejections) a prerequisite for any error-log alerting, or a parallel lane? Alerting on
  error logs while ingestion is broken would produce a system that is confidently silent
  for the wrong reason — the exact 2026-07-06 failure, repeated.

### 7.4 Remediation depth

- Notify only / notify + auto-open issue-or-goal / full auto-fix with PR gate / full
  autonomous? (See §6.3.)
- If a goal is auto-created: which project, what dedup key, and what stops a flapping
  detector opening a goal every cycle?
- What is the allowlist or blacklist of services an agent may touch? `fix(security)`
  surfaces seem an obvious exclusion given the trigger case.
- Who acknowledges? `monitoring.alerts` already has `acknowledgedBy/At` and runlayer has
  an escalation acknowledge/resolve API — two acknowledgement models that would need to
  agree.

### 7.5 Channel design

- Everything currently lands in one Telegram chat (`TELEGRAM_CHAT_ID`, single owner chat).
  Adding job failures, error-log alerts and remediation progress to the same chat that
  already carries the daily digest, deploy failures, token findings and ingest staleness
  risks the muting failure mode that `token-health-guard.sh` explicitly warns about.
  Separate chat/topic, or severity routing?
- Follow `notify.sh`'s borrowing rule — do not mint a second credential for the same
  channel.
- Resolve the possible 08:00 double-digest first (§4.4).

### 7.6 Meta

- **What watches the watcher?** A job-failure watcher that dies is the same silent failure
  one level up. `token-health` answers this with `OnFailure=`; an in-cluster watcher inside
  monitoring-microservice has no equivalent, and `HealthWatcher` does not monitor itself.
  A dead-man's-switch / heartbeat requirement should be explicit in any design.
- Should the ecosystem adopt a standing rule that **every scheduled workload must declare a
  failure destination** before it is allowed to exist? That would make this class of gap
  structurally impossible rather than repeatedly discovered. `CREATE_SERVICE.md` and the
  IPS integration contract are the plausible homes for such a rule.

---

## 8. Evidence index

Commands were run over `ssh alfares`; repository paths are under
`/home/ssf/Documents/Github`. No writes were performed other than creating this file.

**Cluster**
- `kubectl get cronjobs -A -o wide`; `kubectl get jobs -A --sort-by=.metadata.creationTimestamp`
- `kubectl get cronjob catalog-contract-monitor -n statex-apps -o yaml` →
  `lastScheduleTime: 2026-09-04T12:14:00Z`, `lastSuccessfulTime: 2026-09-01T07:14:15Z`
- `kubectl logs -n statex-apps -l app=catalog-contract-monitor` → 4 `Error` pods,
  `product-search` 401 on both profiles
- `kubectl get daemonset -A` → `No resources found`
- `kubectl get secret catalog-microservice-secret -n statex-apps` → key names only;
  `JWT_TOKEN` `exp` decoded locally to 2026-09-11T07:18:51Z, value never printed
- `kubectl get configmap catalog-microservice-config -n statex-apps` → no
  `CATALOG_INTERNAL_SERVICE_NAMES` override

**Repositories**
- `catalog-microservice/scripts/catalog-contract-monitor.js` (194 lines) — `checkTokenExpiry` L35-38, `main` L129-186
- `catalog-microservice/scripts/catalog-smoke.js` — L13-14 credential selection, L51-64 header construction, L69-72 `requestReadContract`, L288-300 `product-search`
- `catalog-microservice/src/auth/catalog-auth.guard.ts` (387 lines) — L140-181 internal-service actor, L169-172 allowlist rejection, L184-233 `rolesForServiceName`, L260-276 default allowlist
- `git show --stat 3fb296a fc2f81c`; `git log -1 b99a38c` → 2026-09-01 09:20:39 +0200
- `monitoring-microservice/TASKS.md:123-151`; `STATE.json`; `git log --oneline -30`
- `monitoring-microservice/src/alerts/{health-watcher,alerts.service,alert-policy,alert-sweeper,alerts.entity}.ts`
- `monitoring-microservice/src/common/notifications/notifications.client.ts`
- `monitoring-microservice/k8s/` — no RBAC manifests present
- `logging-microservice/src/logs/{logs.controller,logs.service}.ts`, `dto/log-entry.dto.ts`, `docs/07_decisions/ADR-001-file-based-rotated-log-storage.md`
- `notifications-microservice/src/telegram/telegram.service.ts:107-224`; `k8s/external-secret.yaml:71-75`; `k8s/configmap.yaml`
- `k8s-manifests/services/pod-janitor.yaml` — RBAC L23-56, `KEEP_FAILED_MINUTES=120` L96-98
- `shared/scripts/token-health/{token-health-guard.sh,README.md}`
- `shared/scripts/deploy-queue/notify.sh`; `worker.sh:109-177`
- `shared/scripts/ecosystem-digest.sh`; `ecosystem-progress-report.py` (no kubectl usage)
- `runlayer/src/coding-worker/coding-worker-agent.service.ts`; `src/goal-review/goal-review.service.ts:95-133`; `src/goals/goals.controller.ts:42`; `src/coordinator/self-healing.service.ts`

**Host**
- `crontab -l` (4 entries); `systemctl --user list-timers --all`
- `~/.config/systemd/user/statex-{token-health,ecosystem-digest}.service|.timer`
- `journalctl --user -u statex-token-health.service` → Sep 4 07:18:26 `1 findings reported to Telegram`
- `journalctl --user -u statex-ecosystem-digest.service` → Sep 3 and Sep 4 08:00 `digest sent`
- `~/.local/state/statex/token-health/baseline.json` → `catalog-microservice / JWT_TOKEN / CRITICAL / HS256 / 7 days`; summary `total 192, critical 12, warn 0, error 0, ok 52`
- `shared/scripts/deploy-queue/queuectl.sh status` → `Watcher: enabled (active)`, 41 services auto-deploy enabled

---

## 9. Reviewer checklist

1. Is the root cause in §2.2 correct and completely established?
2. Are the secondary defects in §2.3 real, and are they in or out of scope?
3. Is the CronJob inventory in §3.1 complete — any scheduled work missed?
4. Is the ~2h evidence-retention constraint (§3.3) correctly characterised, and does it
   invalidate any proposed design?
5. Does §4.2 correctly establish that logging-microservice cannot see CronJob output? This
   is the load-bearing claim against the owner's stated preferred approach.
6. Which option in §7.1 should be recommended, and is cluster read access for
   monitoring-microservice acceptable?
7. Is the "triage automatically, repair under gate" position in §6.3 the right default, or
   too conservative / too aggressive given the trigger case?
8. What is missing from this assessment entirely?
