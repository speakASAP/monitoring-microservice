# Silent-failure coverage: implementation status assessment (day 2, evening)

- **Date:** 2026-09-05, measured ~19:30–21:40 UTC+2
- **Type:** Research / assessment only. **No code, config, or cluster state was changed.**
- **Status:** DRAFT — for multi-agent review before any planning or implementation.
- **Relationship to prior work:** This document **supersedes the status conclusions** of
  [`2026-09-04-silent-failure-assessment.md`](2026-09-04-silent-failure-assessment.md) and
  [`2026-09-05-silent-failure-assessment.md`](2026-09-05-silent-failure-assessment.md).
  Their *analysis* remains sound and is cited throughout. Their *status claims* are stale:
  both say the coverage system does not exist. **It was built and deployed the same day
  they were written.** This document measures what is actually running.
- **Requested outcome (owner):** find errors ASAP and address them ASAP; build it on
  `monitoring-microservice` using `logging-microservice`; **no new applications**.

Convention: `[UNKNOWN: ...]` marks a fact not established. `[VERIFY]` marks a claim a
reviewer should re-confirm before using it as a planning premise. `[GAP-n]` tags an open
defect, collected in §7.

---

## 1. Executive summary

**The headline finding is that the premise of this research task is out of date.**

The task was framed as: nothing watches CronJobs, `catalog-contract-monitor` has failed
since 2026-09-01 with zero alerts, and we need to design an alerting system. Between
13:55 and 20:05 today, **that system was designed, implemented, deployed and is running in
production**. Seventeen commits landed on `main` in `monitoring-microservice`. The
currently-serving pod is image `5ccb4e5`, 82 minutes old at time of measurement.

Measured, not inferred:

- `CronJobNotSucceeding / catalog-contract-monitor` is an **active alert**, fired
  2026-09-05 14:07, **22 occurrences**, last notified 18:37, carrying a captured log tail.
  The exact silence this task was created to fix is over.
- Three new watchers run in production: `JobWatcher`, `ErrorLogWatcher`, `HeartbeatService`.
  All three heartbeat every 5 minutes.
- `ErrorLogWatcher` is producing real signal — six services alerted today, with correct
  automatic resolution (`marathon` recovered after 59m and was announced).
- A **coverage ledger** (`src/config/failure-surfaces.ts`, 25 surfaces) plus a checker
  (`scripts/check-failure-surface-coverage.sh`) reports **zero undeclared surfaces and zero
  surfaces whose failures reach nobody**.
- Host-scheduled work is covered: all 5 crontab entries now run under a
  `run-and-report.sh` wrapper, and a `poll-systemd-timers.sh` entry polls the timers every
  5 minutes.
- Kubernetes read access exists and is genuinely read-only: ClusterRole
  `monitoring-microservice-reader`, bound to a real ServiceAccount, no write verb anywhere.
- Autonomous repair (`RepairService`, `RepairGate`, `RepairVerifier`) is deployed in
  **shadow mode** and is making decisions on live alerts.

**What is therefore left to assess is not "how do we build this" but "is what was built
correct, and what remains open."** Four findings matter for planning:

1. **The repair loop has no execution backend.** `REPAIR_MODE=active` is explicitly
   unimplemented; the code logs an error and degrades to shadow. Autonomy — the owner's
   core ask — is not reachable by flipping a flag. `[GAP-1]`
2. **The repair gate has produced zero allows.** All 8 decisions to date are `blocked`.
   Six were blocked as *unregistered surfaces*, because the ledger has no `service-logs`
   kind — the type union omits it, though the plan's Phase 1 specifies it. So every
   `ServiceLoggingErrors` alert is structurally un-repairable. `[GAP-2]`
3. **Evidence capture takes the wrong end of the log.** `JobWatcher` truncates with
   `text.slice(-max)` — the tail. For `catalog-contract-monitor` the tail is JSON
   boilerplate about disabled optional contracts; the `401` that is the actual cause sits
   in the head and **is not in the alert**. Invariant I2 is implemented but not achieved.
   `[GAP-3]`
4. **Message volume is now 6× baseline.** 36 Telegram messages today against a ~6/day
   baseline, 14 in the 18:00 hour alone. Under D2 (single chat, no routing) the plan named
   noise as the only remaining control. It is already degrading. `[GAP-4]`

The trigger incident itself is **still unfixed** in `catalog-microservice` — correctly so,
since the ledger marks it `autoFixEligible: false` — and its `JWT_TOKEN` now has **5.49
days** left (expires 2026-09-11T07:18:51Z).

---

## 2. What changed since the 09-05 morning assessment

Seventeen commits, all 2026-09-05. Feature commits in dependency order:

| Commit | Delivers | Plan phase |
| --- | --- | --- |
| `a0f41d7` | Failure-surface ledger — every surface declared | Phase 1 |
| `bb96fce` | Crontab gaps closed in ledger | Phase 1/4 |
| `94712f2` | Last three blind surfaces closed | Phase 1 |
| `f397934` | User-scope timers declared | Phase 4 |
| `07da559` | `JobWatcher` + RBAC + heartbeat | Phase 2 + 5a |
| `d07da93` | `ErrorLogWatcher` — services up but logging errors | Phase 3 |
| `cd69c42` | Alert when a service stops shipping logs entirely | Phase 3 |
| `5ccb4e5` | `RepairGate` + `RepairVerifier`, shadow mode | Phase 5b |

Planning commits `90e2fc8` and `642e1ed` produced
[`EP-TASK-006-failure-signal-coverage.md`](../21_execution_plans/EP-TASK-006-failure-signal-coverage.md),
which records four owner decisions. Those decisions are the governing constraints and any
reviewer should read them before proposing changes:

- **D1 — Kubernetes read access: APPROVED, option A** (K8s API poll from monitoring).
- **D2 — single Telegram chat, no routing.**
- **D3 — autonomous repair verified by outcome; no PR, no human gate.**
- **D4 — log-ingestion repair deprioritised** (rechecked, still broken, owner deferred).

**Both prior assessments predate every feature commit.** They should be read as the
evidence base and the reasoning record, not as a description of current state. This is
itself worth noting as a process observation: a reviewer handed the three documents in
filename order would form a materially wrong picture of the system.

---

## 3. What is verified running

### 3.1 Deployment and identity

```
image:              localhost:5000/monitoring-microservice:5ccb4e5
pod:                monitoring-microservice-5d997cd78f-r99sr   1/1 Running   82m
serviceAccountName: monitoring-microservice
clusterrole:        monitoring-microservice-reader        (created 13:55:16Z)
clusterrolebinding: monitoring-microservice-reader
```

This closes `09-05 §3.5`, which measured an empty `serviceAccountName`. The identity now
exists. Per `07da559`'s commit message the grant is `get/list/watch` on `batch` and `pods`
plus `get` on `pods/log`, extended by `5ccb4e5` with `deployments get/list/watch` for
verifier check V1 — **no write verb anywhere**, and the commit records that
delete/create/patch and secrets were verified denied against the live cluster.
`[VERIFY]` a reviewer should independently re-run those `kubectl auth can-i` checks rather
than trust the commit message; the grant is the main new security surface and
`monitoring.alfares.cz` is publicly ingressed.

`rbac.yaml` is ordered before `deployment.yaml` in `deploy.config.sh`, so a pod cannot come
up naming a ServiceAccount that does not exist yet — which would have made `JobWatcher` go
dormant silently. That ordering is a deliberate anti-silent-failure choice and worth
preserving in review.

### 3.2 Live configuration

From `monitoring-microservice-config`:

```
JOB_WATCH_ENABLED=true          JOB_WATCH_CRON=7,22,37,52 * * * *   (15 min)
JOB_WATCH_NAMESPACES=statex-apps
JOB_OVERDUE_MULTIPLE=3          JOB_EVIDENCE_TAIL_LINES=120
ERROR_WATCH_ENABLED=true        ERROR_WATCH_CRON=*/5 * * * *
ERROR_WINDOW_MINUTES=60         ERROR_MIN_OCCURRENCES=3    ERROR_CRITICAL_OCCURRENCES=50
HEARTBEAT_CHECK_ENABLED=true    HEARTBEAT_CHECK_CRON=*/5 * * * *   HEARTBEAT_MISSED_CYCLES=3
HEALTH_WATCH_ENABLED=true       HEALTH_WATCH_CRON=*/5 * * * *
DAILY_DIGEST_ENABLED=true       DAILY_DIGEST_CRON=0 8 * * *
TELEGRAM_CHAT_ID=694579866
```

`JOB_WATCH_CRON` at 15 minutes satisfies the plan's hard bound of
`KEEP_FAILED_MINUTES=120` with wide margin, and `JOB_OVERDUE_MULTIPLE=3` implements the
proposed `N=3`. The plan explicitly invited reviewers to challenge `N`; it shipped at the
proposed value, so that challenge is still open and now has production data behind it (§4).

**`REPAIR_MODE` is absent from the ConfigMap.** `repair.service.ts:41` defaults it to
`shadow`. So shadow is in force by default rather than by declaration. `[VERIFY]` whether
the reviewers want the mode named explicitly in config — an unset variable controlling
whether the system can modify production is a legibility risk even when the default is
safe.

### 3.3 The trigger alert now exists

```
alertname:        CronJobNotSucceeding
service:          catalog-contract-monitor
severity:         critical
status:           active
occurrenceCount:  22
firedAt:          2026-09-05 14:07:00
lastNotifiedAt:   2026-09-05 18:37:00
fingerprint:      cronjob:statex-apps/catalog-contract-monitor
```

Message opens: *"catalog-contract-monitor last succeeded 4.5d ago — roughly 216 missed
run(s) on schedule `14,44 * * * *` (alerts after 1.5h)"*.

22 occurrences with notification at 18:37 shows repeat backoff engaging rather than
notifying 22 times — the noise control works as designed.

### 3.4 Transition semantics hold under load

Invariant I1 was the plan's central noise control. Production evidence supports it:

- The 10 healthy CronJobs each produce a `resolve ... matched no active alert — nothing to
  close` log line per sweep and **no alert**. The four CronJobs with transient failures in
  the preceding eight days produced zero alerts, which is exactly the Phase 2 exit test.
- Only the persistently-broken one alerted.

This is the decisive Phase 2 exit test and it **passes**.

### 3.5 Heartbeats

Every 5 minutes, all three adapters beat:

```
heartbeat:error-log-watcher
heartbeat:job-watcher
heartbeat:repair-orchestrator
```

`heartbeat.service.ts` alerts after `HEARTBEAT_MISSED_CYCLES=3`. `job-watcher.ts:112` calls
`this.heartbeat.fail(...)` on a thrown sweep, so a promptly-failing cycle does not
masquerade as healthy — the distinction `07da559` called out. Phase 5a is delivered.

**Still open from `09-04 §7.6`:** the heartbeat checker is itself in-process. If the pod
dies wholesale, nothing beats and nothing checks. `HealthWatcher` covers
`monitoring-microservice` as a registered service, so pod death is caught by the health
sweep — but that sweep is *also* in the same pod. `[GAP-5]` The out-of-process dead-man's
switch is the host-side `poll-systemd-timers` path, which watches host units, not this pod.
`[VERIFY]` whether any external observer would notice this pod being down for an hour.

### 3.6 Coverage ledger reports clean

```
=== Kubernetes CronJobs ===                          in sync (11 declared)
=== Host crontab entries ===                         in sync (5 declared)
=== Ecosystem systemd timers ===                     in sync (3 declared)
=== Ecosystem user-scope systemd timers ===          in sync (6 declared)
=== Surfaces whose failures currently reach nobody === none
No undeclared surfaces.
```

25 surfaces: 11 `k8s-cronjob`, 5 `host-crontab`, 3 `host-systemd-timer`,
6 `host-user-timer`. 12 `autoFixEligible: false`, 13 `true`.

The Phase 1 exit test asked the checker to reproduce the known-blind list without
hardcoding. It now reports **zero** blind surfaces, because Phase 4 closed them — so the
exit test as written can no longer be run. `[VERIFY]` that the checker genuinely
enumerates from live cluster and host state rather than from the ledger itself; a checker
that compares the ledger to the ledger would report "in sync" forever. This is the single
highest-value verification a reviewer can perform, because this artifact is the spine of
Phase 6 and the thing that makes the gap structurally impossible.

### 3.7 Host-scheduled work is wrapped

All five crontab entries now invoke `shared/scripts/run-and-report.sh <name> <log> <cmd>`.
A fifth entry was added — `*/5 * * * * ... poll-systemd-timers.sh` — which reports timer
outcomes to monitoring.

`poll-systemd-timers.sh` documents why polling replaced `OnFailure=`: the drop-in approach
needs root, `/etc/systemd/system` is root-owned, and sudo on this host is password-gated and
cannot be driven non-interactively. Its stated reasoning — *"a surface that is 'covered
once somebody runs a command' is not covered"* — is the correct instinct and resolves
`09-04 §3.2`'s open question about the sudo boundary.

Confirmed: `statex-token-health.service` remains the only unit with `OnFailure=`. The
other units are covered by polling instead.

### 3.8 Delivery works end to end

`notifications` DB, since 12:00 today: **33 sent, 1 failed**. Telegram messages observed
include alert fires, a `✅ RESOLVED` for `marathon` after 59m, and
`🔒 Autonomous repair declined — human needed` escalations.

The single failure at 19:10 was a `500` from notifications on a repair escalation; the same
class of message sent successfully at 19:00 and 19:25. `[UNKNOWN: root cause]` — most
likely the documented 5-minute content-keyed idempotency dedupe rejecting a near-identical
escalation, but this was not confirmed. Notably `repair.service.ts:224` logs the failure
loudly rather than swallowing it, so the failure was visible — the correct behaviour.
`[GAP-6]` A dropped escalation is still a lost signal; whether it needs a retry or a DLQ is
a design question, and `09-04 §4.3` already noted notifications has neither.

---

## 4. Signal quality: what the new watchers actually produced

Alerts fired today (15 rows, `firedAt > 2026-09-05`):

| alertname | service | sev | status | occ |
| --- | --- | --- | --- | --- |
| `CronJobNotSucceeding` | catalog-contract-monitor | critical | **active** | 22 |
| `ServiceLoggingErrors` | flipflop-product-service | critical | active | 23 |
| `ServiceLoggingErrors` | flipflop-product-service | critical | active | 23 |
| `ServiceLoggingErrors` | notifications-microservice | critical | active | 23 |
| `ServiceLoggingErrors` | payments-microservice | warning | active | 20 |
| `ServiceLoggingErrors` | payments-microservice | warning | active | 8 ×3 |
| `ServiceLoggingErrors` | monitoring-microservice | warning | active | 16 |
| `ServiceLoggingErrors` | marathon | warning | active | 1 |
| `ServiceLoggingErrors` | marathon | warning | **resolved** | 12 |
| `LogIngestStale` | logging-microservice | warning | active | 21 |
| `DeployFailed` | domain-research | critical | active | 1 |
| `DeployFailed` | domain-research | critical | resolved | 1 |

Observations a reviewer should weigh:

1. **The watchers found real, previously-invisible problems.** `flipflop-product-service`
   and `notifications-microservice` are logging errors at critical volume and nobody knew.
   That is the system working as intended on its first day.
2. **`monitoring-microservice` alerted on its own error logs** — fingerprint
   `errorlog:monitoring-microservice/cronjob_not_...`. The service is alerting about its
   own alerting activity. Harmless today, but it is a feedback path and should be
   explicitly excluded or acknowledged. `[GAP-7]`
3. **Nine of twelve alerts remain `active` and unacknowledged.** `09-05 §3.3` flagged one
   standing unacknowledged alert as evidence the channel is under-read. There are now nine.
   The plan's Phase 0 item 2 — triage the standing alert — was not done, and the condition
   it was meant to detect has worsened by 9×.
4. **`DeployFailed / domain-research` fired, resolved, and fired again** (10:02 and 19:03).
   An independently real failure, still open. Out of scope here but should not be lost.

### 4.1 Message volume — the noise control is already strained

```
2026-08-29  105       2026-09-02    5
2026-08-30    9       2026-09-03   11
2026-08-31   52       2026-09-04   15
2026-09-01  104       2026-09-05   36
```

Hourly today: 14:00→5, 15:00→1, 17:00→7, **18:00→14**, 19:00→4.

The plan's D2 consequence said: *"if daily message count exceeds a threshold, that is
itself a finding"*, against a stated ~6/day baseline. Today is 36 and the watchers have been
live for roughly six hours, not a full day. Extrapolated, a steady state with nine standing
alerts on escalating backoff plus a daily digest is plausibly 50–100/day in one chat.

**`[GAP-4]` is therefore not hypothetical.** The plan removed routing (D2) on the
assumption that transition-semantics plus backoff would hold volume down. Transition
semantics *are* working (§3.4) — the volume is not from flapping, it is from **twelve
genuinely distinct problems that were all invisible yesterday**. That is a different
problem than the one D2 was reasoned against: it is a backlog-drain spike, not noise. It
may resolve as the backlog is fixed. It may also cause the channel to be muted before then.
Reviewers should decide whether D2 needs revisiting **for this transitional period only**,
which is a narrower question than reopening the routing decision.

### 4.2 Log-ingest blindness is now surfaced, and it is worse than D4 recorded

`cd69c42` added an alert for services that stop shipping logs at all. It reports:

```
8 service(s) have stopped shipping logs (stale after 24h). Error alerting is blind to them:
  • runlayer                — last log 1465h ago   (61 days)
  • docs-rag-microservice   — last log 1464h ago   (61 days)
  • api-gateway             — last log  565h ago   (24 days)
  • speakasap               — last log  387h ago   (16 days)
  • marketing-microservice  — last log   60h ago
  • minio-microservice      — last log   55h ago
  • speakasap-assessment    — last log   31h ago
  • speakasap-certification — last log   31h ago
```

This is a **different set** from the one D4 recorded this morning (which named
`flipflop-api-gateway`, `bazos-service`, `aukro-service`, `allegro-service`,
`invoices-microservice`, `heureka-service`, `runlayer`, `speakasap`). Same count, different
membership. `[VERIFY]` whether that reflects genuine change during the day, two different
detection methods (rejected-at-ingest vs stale-sender), or an inconsistency. The two lists
answer different questions and should not be conflated.

**`runlayer` has not shipped a log in 61 days.** This matters directly to D3: runlayer is
the intended execution backend for autonomous repair, and the plan's V3 verification must
fail closed on unobservable targets. An execution engine that is itself unobservable is a
poor foundation for a loop whose safety rests on outcome verification. `[GAP-8]`

The design decision in `error-log-watcher.ts:158-172` is correct and worth preserving:
*"This watcher can only see services that send logs. Eight currently do not... [treating
them as fine] is the same false-confidence bug it was built to remove."* The `V3
fails-closed` requirement from the plan is honoured in `repair-verifier.ts` per `5ccb4e5`'s
commit message.

---

## 5. The repair arm: deployed, deciding, and unable to act

### 5.1 What it does today

`RepairService` evaluates every alert through `evaluateRepairGate`, persists a verdict to
`monitoring.repair_attempts`, and announces declines to Telegram. Schema:
`fingerprint, alertname, surface, service, status, blocked_reason, goal_id, commit_sha,
checks jsonb, verification_summary, started_at, finished_at`.

`monitoring.incidents` exists but remains writerless — deliberately, per `5ccb4e5`, so the
alert store stays the single source of truth.

### 5.2 Every decision so far is `blocked`

All 8 decision rows:

| alertname | surface | reason |
| --- | --- | --- |
| `CronJobNotSucceeding` | catalog-contract-monitor | ledger marks `auto_fix_eligible=false`: trigger incident, both credential paths fail |
| `LogIngestStale` | logging-microservice | reports the monitoring stack itself; self-repair could disable the detector |
| `DeployFailed` | domain-research | no ledger entry |
| `ServiceLoggingErrors` | payments-microservice | no ledger entry (×4) |
| `ServiceLoggingErrors` | monitoring-microservice | no ledger entry |
| `ServiceLoggingErrors` | flipflop-product-service | no ledger entry (×2) |
| `ServiceLoggingErrors` | notifications-microservice | no ledger entry |
| `ServiceLoggingErrors` | marathon | no ledger entry (×2) |

**Zero `shadow` rows.** The gate has never reached the "would have acted" state, so the
shadow period has produced **no evidence about the quality of repair decisions** — only
evidence that the refusal paths work. The plan made "watch it decide about real alerts
while it cannot act" the exit criterion for enabling autonomy. That criterion is currently
unmeetable: it is refusing everything before it decides anything.

Two refusals are exactly right and should be preserved:

- The trigger incident is refused by ledger flag, with the reason quoted in the alert. This
  is the containment primitive the plan called the *only* remaining one under D3 working
  precisely as designed on the precise case that motivated it.
- `LogIngestStale` is refused as self-referential. A loop that repairs its own detector can
  silence the signal reporting the repair was wrong. Correct.

### 5.3 `[GAP-2]` The ledger cannot express a service-logs surface

```typescript
export type FailureSurfaceKind =
  | 'k8s-cronjob'
  | 'host-crontab'
  | 'host-systemd-timer'
  | 'host-user-timer'
  | 'k8s-deployment';
```

There is no `service-logs` kind, and no ledger entry exists for any of the six services
that raised `ServiceLoggingErrors`. The plan's Phase 1 table names `service-logs` as a
kind. The implementation omits it.

Consequence: **every `ServiceLoggingErrors` alert is permanently blocked as an unregistered
surface**, regardless of `REPAIR_MODE`. This is the largest single class of alert the new
system produces (6 of 12 today). The refusal message — *"an unregistered surface is never
auto-repaired"* — is a safe default and the right one, but here it is firing because of a
missing type, not a deliberate policy judgement. Those two look identical in the log, which
is the concerning part.

Note also that `k8s-deployment` is declared in the union but **no ledger entry uses it**
(25 entries: 11 cronjob, 5 crontab, 3 systemd-timer, 6 user-timer). Long-running services —
the 63 in `ecosystem-services.ts`, the ones `HealthWatcher` covers and the ones
`ServiceLoggingErrors` fires about — are absent from the ledger entirely. The checker
reports "no undeclared surfaces" because **it does not check deployments**, only CronJobs,
crontab and timers. That is a real hole in the "structurally impossible" claim. `[GAP-9]`

### 5.4 `[GAP-1]` There is no execution backend

`repair.service.ts:114-127`:

```typescript
if (REPAIR_MODE !== 'active') { await this.recordShadow(...); return; }
// Active mode is intentionally not implemented in this commit.
this.logger.error(
  `[RepairService] REPAIR_MODE=active but no execution backend is wired; ${fingerprint} not repaired`,
);
await this.recordShadow(...);
```

The failure mode is handled honestly — it shouts rather than silently declining, which is
the project's own contract applied to itself. But the practical position is:

**Setting `REPAIR_MODE=active` today changes nothing except adding an error log line.**

Per `5ccb4e5`, this is deliberate and reasoned: monitoring's pod has no volumes, no git, no
SSH key and no host filesystem, so it *cannot* commit, deploy or revert. The execution half
belongs to runlayer, which owns the agents and the serialized deploy queue — and the commit
argues that keeping the judge separate from the author is worth more than convenience.

That reasoning is sound. The consequence for planning is that **the owner's "start fixing
automatically" goal is not partially delivered — it is unstarted**, and the remaining work
is a monitoring↔runlayer integration that no commit has touched. `09-04 §6.2` identified
exactly this as the one missing integration, and it is still missing. Combined with
`[GAP-8]` (runlayer has been log-silent for 61 days), this is the largest remaining item.

### 5.5 Open question the shadow data cannot answer

`09-05 Q-B` asked what fraction of the owner's automation goal is actually reachable, given
that roughly half of plausible CronJob failures are credential or identity problems — all
security surfaces, all excluded by policy. Today's data sharpens the question rather than
answering it: of 8 decisions, **1 was excluded by deliberate security policy and 6 by a
missing type**. Once `[GAP-2]` is fixed the ratio will be measurable for the first time.
Reviewers should require that measurement before committing effort to the execution
backend.

---

## 6. `[GAP-3]` Evidence capture takes the wrong end of the log

`job-watcher.ts:297`:

```typescript
return text.length <= max ? text : `${text.slice(-max)}\n…(truncated)`;
```

`JOB_EVIDENCE_TAIL_LINES=120`. For `catalog-contract-monitor`, the last 120 lines are the
closing JSON of the summary object — a list of *skipped optional* contracts:

```
{ "contract": "authorized-channel-status",
  "reason": "Set CATALOG_SMOKE_ENABLE_CHANNEL_STATUS=true to run read-only channel status checks." },
{ "contract": "authorized-heureka-readiness", ... },
{ "contract": "authorized-bazos-draft", ... }
```

The actual cause is earlier in the same output:

```
"failedProfiles": 2,
"failedContracts": [ { "contract": "product-search", "statusCode": 401, ... } ]
```

**That line is not in the alert.** A responder reading the Telegram message sees a wall of
"set this env var to enable optional check" text and no 401 anywhere.

This is subtle and worth stating precisely for reviewers: **invariant I2 is implemented and
still not achieved.** Evidence *is* captured at detection time, exactly as required, and
the code comment at `job-watcher.ts:186` shows the author understood why. The defect is
that "tail of the log" is a good heuristic for crash output — where the error is last — and
a bad one for a structured-report job, where the verdict is a JSON field in the middle and
the trailing content is boilerplate. Five of eleven CronJobs are monitors of this shape
(`09-04 §3.1`), so this affects the majority of the class it was built for.

Options for planning, not a recommendation: head+tail capture; grep-first for
`error|fail|[45]\d\d` and prefer matching lines; or have monitor-class jobs emit a
one-line verdict that the watcher extracts. The third overlaps `09-05 Q-A` (distinguishing
"job ran and failed" from "job ran, passed, and reported a problem"), which remains open
and is arguably the same problem viewed from the job side.

---

## 7. Gap register

| ID | Gap | Severity | Notes |
| --- | --- | --- | --- |
| `GAP-1` | No execution backend for repair; `REPAIR_MODE=active` is a no-op | **High** | Owner's core ask unstarted; needs monitoring↔runlayer integration (§5.4) |
| `GAP-2` | No `service-logs` kind in ledger; all `ServiceLoggingErrors` blocked as unregistered | **High** | Missing type reads identically to a policy refusal (§5.3) |
| `GAP-3` | Evidence capture is tail-only; misses the cause for structured-report jobs | **High** | The 401 is absent from the trigger alert (§6) |
| `GAP-9` | Ledger and checker cover no `k8s-deployment`; 63 services undeclared | **High** | Undermines "no undeclared surfaces" and Phase 6 (§5.3) |
| `GAP-4` | Volume 36/day vs ~6 baseline, 14 in one hour, single chat under D2 | Medium | Backlog-drain spike, not flapping; may self-resolve (§4.1) |
| `GAP-8` | runlayer — the intended executor — has shipped no logs for 61 days | Medium | Unobservable executor under an outcome-verified loop (§4.2) |
| `GAP-5` | Heartbeat checker is in-process; no external observer of this pod | Medium | `09-04 §7.6` carried forward, not closed (§3.5) |
| `GAP-6` | One escalation lost to a notifications `500`; no retry or DLQ | Medium | Logged loudly, not swallowed (§3.8) |
| `GAP-7` | monitoring alerts on its own error logs — feedback path | Low | Harmless today; should be explicit (§4) |
| — | 9 alerts standing unacknowledged; Phase 0 triage not done | Medium | Condition Phase 0 existed to detect, 9× worse (§4) |
| — | `REPAIR_MODE` unset in ConfigMap; safe default, poor legibility | Low | §3.2 |
| — | Stale-sender list differs from D4's rejected list, same count | Low | Two detectors, two questions (§4.2) |

Out of scope but should not be lost: the trigger fix in `catalog-microservice`
(`JWT_TOKEN` expires 2026-09-11T07:18:51Z, **5.49 days**, subject
`catalog-authorized-runtime-smoke`, roles include
`internal:catalog-microservice:admin` — an admin-capable credential, which is why the
ledger marks it ineligible); `DeployFailed / domain-research` active since 19:03; and the
plan's Phase 0 items 1, 3 and 4 (double digest, stale `ECOSYSTEM_MAP.md` Grafana
reference, volume baseline) which appear undone.

---

## 8. Reviewer checklist

1. **Do you accept that the system is built and running**, and that the correct next step
   is verification and gap-closure rather than design? Both prior assessments say otherwise
   and are cited as authoritative by the execution plan.
2. **Verify the RBAC grant independently** (§3.1). Re-run `kubectl auth can-i` for write
   verbs. The grant is the main new security surface on a publicly-ingressed service.
3. **Verify the coverage checker enumerates from live state, not from the ledger** (§3.6).
   If it self-compares, "no undeclared surfaces" is meaningless and Phase 6 rests on
   nothing. Highest-value single check in this document.
4. **Is `GAP-9` (no deployment surfaces in the ledger) a scope decision or an omission?**
   63 services are outside the ledger while raising alerts. This determines whether Phase 6's
   "structurally impossible" claim holds.
5. **`GAP-2`: should `service-logs` be added as a kind, and which services should be
   `autoFixEligible`?** Until then the repair arm cannot act on its largest alert class,
   and the shadow period yields no decision-quality data.
6. **`GAP-3`: what is the right evidence-selection strategy** for structured-report jobs?
   Head+tail, error-grep, or a job-side verdict contract (which merges with `Q-A`)?
7. **`GAP-1`: is the monitoring↔runlayer integration the right next investment**, given
   `GAP-8` (runlayer unobservable) and `Q-B` (unknown reachable fraction)? Or should
   `GAP-2` land first so the fraction becomes measurable?
8. **`GAP-4`: does D2 need a temporary exception** during backlog drain? Note this is a
   spike from newly-visible real problems, not noise — a different question than routing.
9. **Is `JOB_OVERDUE_MULTIPLE=3` right?** The plan invited this challenge; there is now
   production data. Alert latency for the trigger was ~1.5h.
10. **Who acknowledges?** Nine standing alerts and `monitoring.alerts` has
    `acknowledgedBy/At` unused. `09-04 §7.4` raised this; it is now load-bearing.
11. **What is missing from this assessment entirely?**

---

## 9. Evidence index

All commands run locally on `alfares` (no SSH — this host *is* alfares). Repository paths
under `/home/ssf/Documents/Github`. **No writes were performed other than creating this
file.** No secret values were printed; `JWT_TOKEN` was decoded to claims only.

**Git**
- `monitoring-microservice`: `git log --oneline -60`, `git log --format='%h %ad %s' --date=short -30`,
  `git status --short` (clean), `git show --stat 07da559 5ccb4e5 d07da93 cd69c42 a0f41d7 f397934 94712f2`
- `catalog-microservice`: `git log --oneline -5` (HEAD `7f988d0`; no fix commit present)

**Cluster**
- `kubectl -n statex-apps get deploy monitoring-microservice -o jsonpath='{...serviceAccountName}{...image}'`
  → `monitoring-microservice`, `localhost:5000/monitoring-microservice:5ccb4e5`
- `kubectl -n statex-apps get pods -l app=monitoring-microservice` → `1/1 Running 82m`
- `kubectl -n statex-apps get sa | grep monitor`; `kubectl get clusterrole,clusterrolebinding | grep monitor`
  → `monitoring-microservice-reader`, created 2026-09-05T13:55:16Z
- `kubectl -n statex-apps get cm monitoring-microservice-config -o json` (§3.2)
- `kubectl -n statex-apps get cronjobs -o custom-columns=...` → 11 CronJobs;
  `catalog-contract-monitor` `lastSuccessfulTime: 2026-09-01T07:14:15Z`
- `kubectl -n statex-apps logs monitoring-microservice-5d997cd78f-r99sr --tail=3000` — heartbeats,
  `RepairService BLOCKED` lines, `ErrorLogWatcher` debug, one `ERROR` (escalation 500)
- `kubectl -n statex-apps logs -l app=catalog-contract-monitor --tail=200` → `product-search`
  `statusCode: 401`, `failedProfiles: 2` (head); optional-contract JSON (tail)
- `kubectl -n statex-apps get pods -l app=notifications-microservice` → `1/1 Running`, 1 restart 33h ago
- `kubectl -n statex-apps exec deploy/catalog-microservice -c app -- node -e '<decode exp/claims>'`
  → `exp 2026-09-11T07:18:51Z`, 5.49 days, sub `catalog-authorized-runtime-smoke`

**Databases** (all `SELECT` only, via `kubectl exec db-server-postgres-68b95f6c77-88zvh -- psql`)
- `monitoring`: `\d monitoring.alerts`, `\d monitoring.repair_attempts`, `\dt monitoring.*`
  (6 tables; `incidents` writerless)
- alerts fired since 2026-09-05 (15 rows, §4); `CronJobNotSucceeding` and `LogIngestStale`
  message bodies
- `repair_attempts` grouped by alertname/surface/status/reason → 8 rows, all `blocked` (§5.2)
- `notifications`: status counts since 12:00 (33 sent / 1 failed); telegram rows since 17:00;
  per-hour and per-day volume since 2026-08-29 (§4.1)

**Repository files**
- `src/config/failure-surfaces.ts` — `FailureSurfaceKind` union L35-41, 25 entries
- `src/alerts/` — `job-watcher.ts` (L106-112 heartbeat-on-failure, L186 comment, L297 `slice(-max)`),
  `error-log-watcher.ts` (L158-172 coverage reasoning), `heartbeat.service.ts` (L8-16, L62, L108)
- `src/repair/repair.service.ts` — L41 `REPAIR_MODE` default, L88-127 gate/shadow/active,
  L221-226 escalation error path; `repair-gate.ts:94` ineligibility reason
- `src/common/notifications/notifications.client.ts:23-37`
- `scripts/check-failure-surface-coverage.sh` — executed, output in §3.6
- `docs/21_execution_plans/EP-TASK-006-failure-signal-coverage.md` (read in full)
- `docs/09_assessments/2026-09-04-...md` and `2026-09-05-...md` (read in full)

**Host**
- `crontab -l` → 5 entries, all wrapped in `run-and-report.sh`
- `systemctl --user list-timers --all` → 7 timers
- `grep -l OnFailure ~/.config/systemd/user/*.service` → `statex-token-health.service` only
- `shared/scripts/poll-systemd-timers.sh` (207+ lines), `shared/scripts/run-and-report.sh`
