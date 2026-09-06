# Silent-failure coverage: day-3 independent verification

- **Date:** 2026-09-06, measured ~05:10–05:30 UTC
- **Type:** Research / assessment only. **No code, config, or cluster state was changed.**
- **Status:** DRAFT — for multi-agent review before any planning or implementation.
- **Requested outcome (owner):** find errors ASAP and address them ASAP; build it on
  `monitoring-microservice` using `logging-microservice`; **no new applications**.

**Relationship to prior documents in this series.** Read them in this order, not filename order:

| Document | What it is | Status |
| --- | --- | --- |
| `2026-09-04-silent-failure-assessment.md` | Original gap analysis | **Status claims stale.** Analysis sound. |
| `2026-09-05-silent-failure-assessment.md` | Morning re-verification | **Status claims stale.** |
| `2026-09-05-silent-failure-implementation-status.md` | Day-2 evening measurement | **Broadly confirmed.** See §4 for corrections. |
| **This document** | Day-3 independent re-measurement | Current. |

The task that produced this document was framed on the 09-04 premise ("nothing watches
CronJobs, zero alerts, design a system"). **That premise has been obsolete since
2026-09-05.** The system was designed, built, deployed and is running. This document does
not re-derive that finding — the day-2 status document established it. What this document
adds is: **independent verification of the claims the day-2 document marked `[VERIFY]`**,
**the day-3 status of each open gap**, and **three corrections plus two new findings**.

Convention: `[UNKNOWN: ...]` marks a fact not established. `[VERIFY]` marks a claim a
reviewer should re-confirm. `[GAP-n]` tags open defects, numbered consistently with the
day-2 document.

---

## 1. Executive summary

The coverage system is **live, correct on its central mechanism, and producing real
signal**. The silence this lane was created to end is over and has stayed over for a
second day. Measured this morning, not inferred:

- `CronJobNotSucceeding / catalog-contract-monitor` — **active, critical, 61 occurrences**,
  first fired 2026-09-05 14:07, last fired 2026-09-06 05:07, last *notified* 03:07.
  Firing every 15-minute sweep; notifying on backoff. Working exactly as designed.
- **Ten healthy CronJobs produce zero alerts.** The transition-semantics noise control
  (invariant I1) holds under a second day of load. This is the decisive Phase 2 exit test
  and it passes.
- Four alert classes are in production and firing on real problems:
  `CronJobNotSucceeding`, `ServiceLoggingErrors`, `LogIngestStale`, `HostJobFailed`.
- The RBAC grant is **verified read-only by direct `kubectl auth can-i` probes**, not by
  reading the commit message.
- The coverage checker is **verified to enumerate from live `kubectl` and the live host
  crontab**, not from the ledger. It is not a ledger-comparing-itself tautology.

Four things a reviewer must weigh before planning:

1. **`[GAP-1]` Autonomy is not reachable.** `REPAIR_MODE=active` has no execution backend;
   the code logs an error and degrades to shadow. This is the owner's core ask and it is
   the one thing not built. Unchanged since day 2.
2. **`[GAP-2]` The repair gate has still never allowed anything. 18 attempts, 18 blocked.**
   Confirmed structural: the ledger declares 25 surfaces and **zero** of kind
   `k8s-deployment`, so every `ServiceLoggingErrors` alert — the highest-volume class —
   blocks as "unregistered surface". Worsened from 8 attempts on day 2.
3. **`[GAP-3]` Evidence capture takes the wrong end of the log.** Verified against the live
   alert row: the stored message contains only "optional contract skipped" JSON
   boilerplate. **The `401` that is the actual cause is not in the alert.** An operator or
   agent reading this alert cannot see why the job failed.
4. **`[GAP-6]` is worse than day 2 recorded, and its cause was misdiagnosed.** Both repair
   escalations that failed did so from **DNS resolution failure**
   (`getaddrinfo EAI_AGAIN api.telegram.org`), not the idempotency dedupe the day-2
   document suspected. The escalation path catches and logs without retry, so both alerts
   are **permanently lost**.

**The trigger incident is still unfixed** in `catalog-microservice` — correctly, since the
ledger marks it `autoFixEligible: false`. Its `JWT_TOKEN` now has **5.08 days** left
(expires 2026-09-11T07:18:51Z). See §6 — this is the nearest hard deadline in the lane.

---

## 2. Verified running (day 3)

### 2.1 Deployment and identity

```
image:               localhost:5000/monitoring-microservice:5ccb4e5
pod:                 monitoring-microservice-5d997cd78f-r99sr  1/1 Running
pod start:           2026-09-05T18:05:31Z   (~11h at measurement)
serviceAccountName:  monitoring-microservice
clusterrole:         monitoring-microservice-reader   (created 2026-09-05T13:55:16Z)
clusterrolebinding:  monitoring-microservice-reader
HEAD:                901bc83  (docs only; 5ccb4e5 is the newest feature commit)
```

The deployed image is the newest feature commit. Commits after it are documentation only,
so **there is no undeployed feature work** — a distinction worth stating explicitly given
this ecosystem's recorded stale-image trap.

### 2.2 `[VERIFY]` discharged — the RBAC grant is genuinely read-only

The day-2 document asked a reviewer to re-run the authorization probes rather than trust
the commit message. Run directly against the live cluster as the service account:

```
get    pods  → yes        create pods   → no
list   pods  → yes        delete pods   → no
watch  pods  → yes        patch  pods   → no
get pods/log → yes        update pods   → no
                          get    secrets → no
                          delete jobs    → no
```

**The grant is read-only as claimed.** No write verb is reachable, and `secrets` is denied.
The widest grant remains `pods/log`, which can read any pod's output cluster-wide and may
include secrets an application prints. That is a real and correctly-documented residual
risk, accepted deliberately because a Job outlives its own logs.

### 2.3 `[VERIFY]` discharged — the coverage checker is not a tautology

The day-2 document called this "the single highest-value verification a reviewer can
perform", because a checker that compares the ledger to the ledger reports "in sync"
forever. **It does not.** `scripts/check-failure-surface-coverage.sh` enumerates live state:

- CronJobs from `kubectl -n statex-apps get cronjobs -o jsonpath=...`
- crontab entries by parsing the live `crontab -l` output
- systemd timers from the live timer list

…and compares that to names parsed out of `src/config/failure-surfaces.ts`. Drift is
reported in both directions (`UNDECLARED` exits non-zero; `STALE` warns). Run live today:

```
=== Kubernetes CronJobs ===                            in sync (11 declared)
=== Host crontab entries ===                           in sync (5 declared)
=== Ecosystem systemd timers ===                       in sync (3 declared)
=== Ecosystem user-scope systemd timers ===            in sync (6 declared)
=== Surfaces whose failures currently reach nobody === none
No undeclared surfaces.                                 EXIT=0
```

This artifact is sound and is the strongest thing in the lane. It is the mechanism that
makes the class of gap structurally impossible rather than repeatedly rediscovered.

### 2.4 The eleven CronJobs, measured

| CronJob | Schedule | Interval | Last success | State |
| --- | --- | --- | --- | --- |
| `catalog-contract-monitor` | `14,44 * * * *` | 30m | **2026-09-01T07:14Z (4.9d)** | **BROKEN, alerting** |
| `cliplot-readiness-monitor` | `19,49 * * * *` | 30m | 04:49 | healthy |
| `domain-research-expiry-recheck` | `2-57/5 * * * *` | 5m | 05:12 | healthy |
| `domain-research-notification-dispatch` | `9-59/15 * * * *` | 15m | 05:09 | healthy |
| `marketing-order-affinity-allegro-daily` | `23 2 * * *` | 1440m | 02:23 | healthy |
| `marketing-order-affinity-aukro-daily` | `50 14 * * *` | 1440m | 09-05 12:50 | healthy |
| `marketing-order-affinity-bazos-daily` | `0 23 * * *` | 1440m | 09-05 21:00 | healthy |
| `marketing-order-affinity-central-orders-backfill` | `20 3 * * *` | 1440m | 03:20 | healthy |
| `pod-janitor` | `*/15 * * * *` | 15m | 05:00 | healthy |
| `speakasap-lesson-record-sync` | `20 2 * * *` | 1440m | 02:20 | healthy |
| `warehouse-reservation-expiry` | `3-58/5 * * * *` | 5m | 05:13 | healthy |

Interval column independently recomputed by running the shipped `maxIntervalMinutes()`
against each live schedule. All eleven parse correctly; none fall back to the 24h default.
For the broken job: 30m × `JOB_OVERDUE_MULTIPLE=3` = **90-minute** overdue threshold
against an actual age of 4.9 days. The arithmetic is correct and the margin is enormous.

**A note for reviewers reading the pod logs directly.** Each sweep emits ten lines reading
`resolve for fingerprint=cronjob:... matched no active alert — nothing to close`, one per
*healthy* job. This looks alarming and is not: it is the no-op resolve path for jobs that
are fine. The broken job does not appear in that list because it is firing, and a
deduplicated re-fire on an existing row logs nothing. Reading only those lines gives the
false impression that the watcher is resolving the broken job. It is not — the alert row
proves otherwise. Recommend a reviewer confirm state from `monitoring.alerts`, never from
the sweep log alone.

### 2.5 Live watcher configuration

```
JOB_WATCH_ENABLED=true    JOB_WATCH_CRON=7,22,37,52 * * * *   JOB_WATCH_NAMESPACES=statex-apps
JOB_OVERDUE_MULTIPLE=3    JOB_EVIDENCE_TAIL_LINES=120
ERROR_WINDOW_MINUTES=60   ERROR_MIN_OCCURRENCES=3             ERROR_CRITICAL_OCCURRENCES=50
DAILY_DIGEST_ENABLED=true DAILY_DIGEST_CRON=0 8 * * *
REPAIR_MODE=<empty>
```

`JOB_WATCH_CRON` is deliberately offset from the `:00/:15/:30/:45` grid `pod-janitor` runs
on, so evidence capture does not race the sweeper deleting the pods holding it. That is a
good detail and worth preserving.

**`REPAIR_MODE` is present in the ConfigMap but empty**, so `repair.service.ts:41` applies
its `'shadow'` default. Shadow is therefore in force *by fallback*, not by declaration. An
empty variable governing whether a system may modify production is a legibility risk even
when the default is safe. Recommend naming it explicitly. `[GAP-8, new]`

---

## 3. Open gaps — day-3 status

| Gap | Description | Day-2 | Day-3 | Change |
| --- | --- | --- | --- | --- |
| `[GAP-1]` | `REPAIR_MODE=active` has no execution backend | open | **open** | unchanged |
| `[GAP-2]` | Repair gate has never allowed anything | 8 blocked | **18 blocked** | worsened |
| `[GAP-3]` | Evidence capture takes log tail, cause is in head | open | **open, confirmed empirically** | now proven |
| `[GAP-4]` | Message volume above baseline | 36/day | **~75/day projected** | see §4.1 |
| `[GAP-5]` | Heartbeat checker is in-process | open | **open** | unchanged |
| `[GAP-6]` | Escalation delivery can drop silently | 1 failure, cause unknown | **cause found: DNS; no retry** | root-caused |
| `[GAP-7]` | Monitoring alerts on its own error logs | open | **open, still active** | unchanged |
| `[GAP-8]` | `REPAIR_MODE` unset rather than declared | — | **new** | new |
| `[GAP-9]` | `ServiceLoggingErrors` splits one fault into N alerts | — | **new** | new |

### 3.1 `[GAP-1]` Autonomy has no execution backend — the owner's core ask

`repair.service.ts:114-125`: when `REPAIR_MODE !== 'active'` the service records a shadow
decision. Reaching the active branch logs
`REPAIR_MODE=active but no execution backend is wired`. The comment states active mode is
*"intentionally not implemented in this commit."*

This is the honest and correct way to ship a gate before its actuator. But it means the
owner's requirement — *"the system which will raise alerts and will start to fix it"* — is
**half delivered**. Detection and alerting are done and working. Repair is a decision
engine with no hands. Flipping the flag does not produce autonomy; it produces an error
log and a degrade to shadow.

The day-2 document records owner decision **D3 — autonomous repair verified by outcome; no
PR, no human gate.** The obvious execution backend is `runlayer`, which already dispatches
Claude Code CLI jobs and already creates goals via `POST /projects/:projectId/goals`. No
path from monitoring into runlayer exists. That integration is the single largest
remaining piece of work in the lane. `[VERIFY]` auth, schema and idempotency of that
endpoint before treating it as the seam.

### 3.2 `[GAP-2]` The gate blocks everything — structural, not incidental

All 18 repair attempts to date are `blocked`. Grouped by reason:

| Blocked reason | Attempts | Services |
| --- | --- | --- |
| `no ledger entry for '<svc>' — an unregistered surface is never auto-repaired` | 15 | payments (5), marathon (4), flipflop-product-service (2), monitoring, notifications, cliplot, domain-research |
| `ledger marks <x> auto_fix_eligible=false` | 2 | catalog-contract-monitor, check-ingest-staleness |
| `LogIngestStale reports the monitoring stack itself` | 1 | logging-microservice |

The 15 "unregistered surface" blocks are the structural defect. The ledger's
`FailureSurfaceKind` union *does* include `k8s-deployment`, but **zero ledger entries use
it** — all 25 declared surfaces are `k8s-cronjob` (11), `host-crontab` (5),
`host-systemd-timer` (3), `host-user-timer` (6). Long-running services are not declared as
surfaces at all.

So `ServiceLoggingErrors` — the highest-volume alert class by a wide margin — is
**structurally un-repairable**. Every such alert will block forever, and each block emits a
`🔒 Autonomous repair declined` Telegram message. This is simultaneously the reason
autonomy cannot engage and a meaningful contributor to `[GAP-4]`.

The day-2 document attributed this to the type union omitting `service-logs`. **That is not
quite right** — the union has `k8s-deployment`, which is a reasonable home for a
long-running service. The defect is in the *data*, not the type: no entries were written.
That is a smaller fix than day 2 implied, and it is a prerequisite for `[GAP-1]` being
worth wiring at all.

### 3.3 `[GAP-3]` The alert does not contain the cause — confirmed empirically

`job-watcher.ts:297` truncates with `text.slice(-max)` — the **last** 900 characters. The
day-2 document predicted the `401` would be missing. Reading the live alert row confirms
it. The stored message, in full:

```
catalog-contract-monitor last succeeded 4.9d ago — roughly 235 missed run(s)
on schedule "14,44 * * * *" (alerts after 1.5h)
Last output (catalog-contract-monitor-29811164-dn5xp):
projection",
          "reason": "No product ID available for authorized FlipFlop projection check."
        },
        {
          "contract": "authorized-channel-status",
          "reason": "Set CATALOG_SMOKE_ENABLE_CHANNEL_STATUS=true to run read-only channel status checks."
        },
        ...
```

Total message length 1093 characters, of which the evidence portion is **entirely
"optional contract skipped" boilerplate**. The `/api/products/search` `401` — the actual
root cause, the thing the whole lane exists to surface — **does not appear**.

Invariant I2 ("an alert must carry the reason, because the pod holding it will be deleted
within 120 minutes") is implemented in mechanism and **defeated in practice**. An agent
handed this alert cannot act on it. For an autonomy loop this is disqualifying: `[GAP-1]`
and `[GAP-3]` compound, because wiring an execution backend to evidence that omits the
cause produces an agent guessing.

Head-vs-tail is not a general answer either — some failures put the cause last (a stack
trace), others first (this one). Reviewers should consider capturing both ends, or
filtering for error-shaped lines, rather than flipping the slice direction.

### 3.4 `[GAP-6]` Escalations are lost, and the cause was misdiagnosed

The day-2 document recorded one failed escalation at 19:10 and suspected the documented
5-minute content-keyed idempotency dedupe. **That is wrong.** The `error` column shows:

```
2026-09-05 19:40  failed  Telegram sending failed: getaddrinfo EAI_AGAIN api.telegram.org
2026-09-05 19:10  failed  Telegram sending failed: Error
```

`EAI_AGAIN` is transient DNS resolution failure — a network condition, not policy. There
were **two** failures, not one, and both were `DeployFailed` escalations
(`cliplot`, `domain-research`).

`repair.service.ts:222-225` wraps the send in try/catch and logs the error. There is no
retry and no dead-letter queue, and `notifications-microservice` has neither either. So
**both escalations are permanently lost.** The alert rows survive in the database, but
nothing announced them and nothing will.

This is a genuine instance of the exact failure class the lane exists to eliminate — a
signal that reached nobody — inside the remediation path itself. It is narrow (transient
DNS, low frequency) but it is not theoretical: it has already happened twice in the
system's first six hours. Note the code does log loudly rather than swallowing, which is
correct and is why this was findable at all.

### 3.5 `[GAP-9]` One fault becomes N alerts — new

Four separate active alert rows exist for `payments-microservice`, all
`ServiceLoggingErrors`, all with the same message prefix `HTTP <n> Error: Not ...`, at
occurrence counts 138/126/126/126:

```
errorlog:payments-microservice/HTTP <n> Error: Not ~a0760e7e924c
errorlog:payments-microservice/HTTP <n> Error: Not ~7310b0a2a323
errorlog:payments-microservice/HTTP <n> Error: Not ~a3908bf1fc05
errorlog:payments-microservice/HTTP <n> Error: Not ~12faef79e1e6
```

The fingerprint is `errorlog:<service>:<signature>`. The signature normaliser clearly
digit-masks (`HTTP <n>`), but the four hashes differ, so some residual variance — a URL
path, an ID, a host — survives normalisation past the visible prefix. The result is one
underlying fault presenting as four independent alerts, each with its own backoff schedule
and each generating its own `🔒 repair declined` escalation.

This is a **noise multiplier and a triage hazard**: it inflates the standing-alert count,
makes the channel look four times worse than it is, and would cause an autonomy loop to
open four repair attempts for one problem. `[VERIFY]` the exact normalisation rules in the
signature builder and what variance is leaking through — recommended as a specific review
target, since the same weakness will apply to every service with parameterised error
messages, not just payments.

---

## 4. Corrections to the prior documents

Three claims in earlier documents in this series do not survive re-measurement.

1. **The 08:00 "possible double-digest" (09-04 §4.4) is not a duplication.** Four
   *distinct* daily senders exist, verified from the notifications table:
   `statex-deploy-queue` 06:00 "Ecosystem Progress Digest"; `runlayer` 08:00 "Morning
   Digest"; `monitoring-microservice` 08:00 "Monitoring Daily Digest"; `runlayer` 20:00
   "Evening Digest". The two at 08:00 are different products from different services, not
   the same message twice. The `[UNKNOWN]` in 09-04 §4.4 can be closed — but note the real
   finding underneath it stands: **four scheduled digests land in one chat daily** before
   any alert traffic is counted, which is context for `[GAP-4]`.

2. **`[GAP-6]`'s cause is DNS, not idempotency dedupe** (§3.4), and there were two
   failures, not one.

3. **`[GAP-2]`'s root is missing ledger data, not a missing type** (§3.2). The union
   already has `k8s-deployment`.

Additionally, the 09-04 document's §7.1 poses "which source of truth" as the central open
question and leans toward option A. That question is **closed by implementation**: option A
was chosen, built, deployed and is verified working. Reviewers should not re-litigate it.
The 09-04 document's load-bearing claim — that logging-microservice cannot see CronJob
output because no collector daemonset exists — was re-verified today
(`kubectl get daemonset -A` → `No resources found`) and **remains true**.

---

## 5. Signal quality and volume

### 5.1 Standing alerts, measured 05:20 UTC

Ten active, all unacknowledged:

| alertname | service | sev | occ |
| --- | --- | --- | --- |
| `CronJobNotSucceeding` | catalog-contract-monitor | critical | 61 |
| `ServiceLoggingErrors` | payments-microservice | — | 138 |
| `ServiceLoggingErrors` | payments-microservice ×3 | — | 126 each |
| `ServiceLoggingErrors` | flipflop-product-service | — | 141 |
| `ServiceLoggingErrors` | flipflop-product-service | — | 4 |
| `ServiceLoggingErrors` | monitoring-microservice | — | 134 |
| `LogIngestStale` | logging-microservice | — | 139 |
| `HostJobFailed` | check-ingest-staleness | — | 1 |

Day 2 reported nine standing unacknowledged alerts and flagged the count as evidence the
channel is under-read. It is now ten, and **none of the nine were acknowledged
overnight**. `monitoring.alerts` has `acknowledgedBy/acknowledgedAt` columns and both are
null on every row. The acknowledgement mechanism exists and is unused.

That matters more than the raw number. A standing-alert list nobody acknowledges converges
on the muted-channel failure mode that `token-health-guard.sh` explicitly warns about, and
which is how the original incident stayed invisible for four days. **The system's ability
to detect has clearly outrun the operation's ability to absorb.**

`HostJobFailed / check-ingest-staleness` is worth a reviewer's specific attention: the
03:45 ingest-staleness detector *itself* failed at 01:45 and was correctly caught by the
new host-job wrapper. A detector failing is exactly the meta-case the lane was built for,
and the coverage worked.

### 5.2 Volume

Telegram messages per day (from `notifications`):

```
08-27  107     08-31   80     09-04   51
08-28   93     09-01  172     09-05   82
08-29  130     09-02   33     09-06   16  (partial, ~5h → ~75/day projected)
08-30   40     09-03   51
```

Two readings, and reviewers should decide between them:

- **Reassuring:** 82 on day 2 and ~75 projected for day 3 sit *below* the pre-lane peaks of
  172 (09-01) and 130 (08-29). The channel is not at an unprecedented level.
- **Concerning:** the pre-lane peaks were the `STILL FAILING` repeat defect, which was
  fixed by `284c9b8`. The quiet floor after that fix was 33–51/day. The new watchers have
  roughly doubled it against that floor, and volume is *stable* rather than draining,
  because ten standing alerts keep re-notifying on backoff and each blocked repair adds an
  escalation.

The day-2 document argued this is a backlog-drain spike that may resolve as problems are
fixed. **Day 3 does not yet support that hope** — nothing was acknowledged or fixed
overnight, and volume held. Whether D2 (single chat, no routing) needs revisiting for the
transitional period is a live question, and `[GAP-9]`'s 4× inflation and `[GAP-2]`'s
guaranteed-blocked escalations are both mechanical contributors that could be reduced
without reopening the routing decision at all.

### 5.3 Log-ingest blindness

`LogIngestStale` is active with 139 occurrences. Owner decision **D4** deprioritised
log-ingestion repair. The consequence is worth restating plainly for reviewers, because it
bounds what `ErrorLogWatcher` can ever do: **eight services do not ship logs at all**
(day-2 measurement: runlayer 61d, docs-rag 61d, api-gateway 24d, speakasap 16d,
marketing 60h, minio 55h, speakasap-assessment 31h, speakasap-certification 31h). Error
alerting is structurally blind to every one of them. The system is *confidently silent*
about those services — which is the precise 2026-07-06 failure mode, now surfaced and
declared rather than hidden. Surfacing it is progress; it remains unfixed by decision.

---

## 6. The trigger incident

Still unfixed, correctly, and now on a deadline.

- `catalog-contract-monitor` last succeeded **2026-09-01T07:14:15Z** — 4.9 days.
- Job `catalog-contract-monitor-29811164` shows 4 failed pods; `-29811194` active at
  measurement.
- `catalog-microservice` HEAD (`9a74bd3`) contains **no fix commit** — recent commits are
  documentation reconciliation only.
- The ledger marks it `autoFixEligible: false` with reason: *"Trigger incident. Broken
  since 2026-09-01 by catalog auth hardening; both credential paths fail."* The gate
  correctly refuses to touch it.
- **`JWT_TOKEN` expires 2026-09-11T07:18:51Z — 5.08 days from now.** Decoded from the live
  secret's claims; the value itself was not printed.

The two failures are independent and both must be fixed: the `401` is an authorization
allowlist question in `catalog-microservice`, and the token expiry is a rotation question.
Fixing only the token leaves the `401`. Fixing only the `401` leaves a job that breaks
again on 09-11.

This remains the strongest argument in the whole lane **against** blanket autonomy: the
correct remedy is a deliberate security decision about which callers may reach
`/api/products/search`, made by commits explicitly written (`3fb296a`, `fc2f81c`) to force
a human to make it. An agent "fixing the 401" by widening an allowlist would undo a
deliberate hardening. The ledger's `autoFixEligible: false` encodes exactly this judgement
and is the right primitive.

---

## 7. Questions for the reviewing agents

The architecture questions from 09-04 §7 are closed by implementation. These are the ones
that remain live.

1. **Is `[GAP-3]` disqualifying for autonomy?** An alert that omits the cause cannot drive
   an agent. Should evidence capture be fixed *before* any execution backend is wired?
   (This assessment's view: yes — `[GAP-1]` and `[GAP-3]` compound.)
2. **What is the execution backend for `[GAP-1]`?** runlayer goal creation is the obvious
   candidate and needs no new application, matching the owner's constraint. What are its
   auth, schema and idempotency semantics, and what stops a flapping detector opening a
   goal per cycle?
3. **Should the ledger gain `k8s-deployment` entries** so `ServiceLoggingErrors` becomes
   repairable, or is blocking-by-default correct for long-running services until autonomy
   is proven? Note this choice also affects `[GAP-4]` volume.
4. **`[GAP-9]`:** what variance is leaking through the error signature normaliser, and does
   fixing it materially reduce volume?
5. **`[GAP-6]`:** does the escalation path need a retry, a DLQ, or is loud logging
   sufficient? Note `notifications-microservice` has neither retry nor DLQ, so this is an
   ecosystem-wide question, not a monitoring-local one.
6. **`[GAP-5]`:** what watches this pod? Every watcher, the heartbeat checker, and
   `HealthWatcher`'s own coverage of `monitoring-microservice` all live in the same
   process. If the pod dies, the host-side `poll-systemd-timers` path watches host units,
   not this pod. Would anyone notice an hour of downtime?
7. **Acknowledgement:** ten standing unacknowledged alerts with an unused
   `acknowledgedBy/At` mechanism. Is this a tooling problem, a process problem, or evidence
   that severity routing (reopening D2) is needed after all?
8. **Is the transitional volume acceptable?** ~75/day against a 33–51/day post-fix floor,
   in a single chat that also carries four daily digests.
9. **What is missing from this assessment entirely?**

---

## 8. Evidence index

All commands run locally on `alfares` (this host). **No writes were performed** other than
creating this file. No secret values were printed; the JWT was decoded to its `exp` claim
only.

**Cluster**
- `kubectl get cronjobs -A -o custom-columns=...` → 11 CronJobs, `lastSuccessfulTime` per job
- `kubectl get jobs -A --sort-by=.metadata.creationTimestamp` → `catalog-contract-monitor-29811164` 4 failed
- `kubectl get deploy monitoring-microservice -n statex-apps -o jsonpath=...` → image `5ccb4e5`, SA `monitoring-microservice`
- `kubectl get pod -l app=monitoring-microservice -o jsonpath='{...status.startTime}'` → 2026-09-05T18:05:31Z
- `kubectl get sa/clusterrole/clusterrolebinding monitoring-microservice[-reader]` → all present, created 13:55:16Z
- `kubectl auth can-i {get,list,watch,create,delete,patch,update} pods --as=system:serviceaccount:statex-apps:monitoring-microservice` (§2.2)
- `kubectl auth can-i get secrets|delete jobs|get pods/log --as=...`
- `kubectl get daemonset -A` → `No resources found` (re-verifies the 09-04 load-bearing claim)
- `kubectl get cm monitoring-microservice-config -o jsonpath=...` → watcher config, `REPAIR_MODE` empty
- `kubectl exec deploy/monitoring-microservice -c app -- env | grep JOB_` → SA token mounted, watchers enabled
- `kubectl logs -l app=monitoring-microservice --tail=6000` → sweep lines, no `CronJobNotSucceeding` fire line (see §2.4 note)
- `kubectl get secret catalog-microservice-secret -o jsonpath='{.data.JWT_TOKEN}'` → decoded to `exp:1789111131` = 2026-09-11T07:18:51Z; value never printed

**Databases** (via postgres MCP, read-only)
- `monitoring.alerts` — active alert rows, occurrence counts, `lastNotifiedAt`, null `acknowledgedBy/At`; full `message` of the catalog alert (§3.3)
- `monitoring.repair_attempts` — 18 rows, all `blocked`, grouped by `blocked_reason` (§3.2)
- `public.notifications` — per-day volume 08-27→09-06; `status<>'sent'` rows with `error` column (§3.4); digest sender identification (§4.1)

**Repository** (`monitoring-microservice`, HEAD `901bc83`)
- `k8s/rbac.yaml` — SA + ClusterRole + binding, get/list/watch only
- `src/k8s/kube-client.ts` — read-only client; token re-read per call
- `src/k8s/cron-schedule.ts` + `dist/` — `maxIntervalMinutes()` run against all 11 live schedules (§2.4)
- `src/alerts/job-watcher.ts` — `JOB_WATCH_CRON` offset rationale, overdue logic L120-160, `truncate` L296-297 (`slice(-max)`)
- `src/alerts/error-log-watcher.ts` — `fingerprintFor` L216-217, `handleGroup` L219-245
- `src/config/failure-surfaces.ts` — `FailureSurfaceKind` L35-40; zero `k8s-deployment` entries
- `src/repair/repair.service.ts` — `REPAIR_MODE` default L41, active-mode stub L114-125, `announceBlocked` L205-225
- `scripts/check-failure-surface-coverage.sh` — live enumeration, run to completion EXIT=0 (§2.3)
- `git log --oneline --since=2026-09-04 --stat` → feature commits `a0f41d7`…`5ccb4e5`, then docs only

**Host**
- `crontab -l` → 5 entries, all wrapped by `run-and-report.sh`
- `systemctl --user list-timers --all` → token-health, ecosystem-digest, next-tasks-scan
- `ls shared/scripts/{run-and-report.sh,poll-systemd-timers.sh}` → both present
