# EP-TASK-006: Failure-signal coverage — a system that cannot fail quietly

```yaml
id: EP-TASK-006
status: approved
source_task: TO BE CREATED ON APPROVAL (docs/11_tasks/TASK-006-failure-signal-coverage.md)
owner: unassigned — decisions approved 2026-09-05, implementation owner TBD
created: 2026-09-05
last_updated: 2026-09-05
completeness_level: approved-for-implementation
```

## Metadata

**Status:** APPROVED 2026-09-05. All four blocking decisions are answered by the owner and
recorded in §2. **No code, config or cluster state has been changed by this document.**
The IPS chain (task, milestone, feature, goal-impact, context package) should now be
created as the first implementation step, since the decisions that would have made it
guesswork are settled.

**Evidence base:** [`docs/09_assessments/2026-09-04-silent-failure-assessment.md`](../09_assessments/2026-09-04-silent-failure-assessment.md)
and [`docs/09_assessments/2026-09-05-silent-failure-assessment.md`](../09_assessments/2026-09-05-silent-failure-assessment.md).
Every factual claim below is cited to one of those. This plan adds no new facts; it
converts them into sequenced work.

**Scope:** build the general capability — *no failure anywhere in the ecosystem goes
unheard* — rather than repair the one CronJob that exposed its absence. The
`catalog-microservice` fix is explicitly **out of scope** and tracked separately (§7.1).

---

## 1. The problem, stated generally

The ecosystem does not have an alerting problem. It has a **coverage** problem.

The alert engine works: it fired, deduplicated and resolved five alerts for four services
in the same 96-hour window it stayed completely silent about ~200 consecutive CronJob
failures (`09-05 §3.3`). Delivery works: Telegram is a solved, reused path with plain-text
fallback, truncation and content-keyed idempotency (`09-04 §4.3`). Dedup, flap damping,
repeat backoff and deferred recovery all shipped on 2026-09-04 and were verified in
production (`TASKS.md`, `284c9b8`).

What is missing is **inputs**. `HealthWatcher` observes exactly one signal class — an HTTP
`/health` endpoint on a service listed in a hardcoded TypeScript array
(`src/config/ecosystem-services.ts`, 63 entries). Every other way a system can fail is
invisible by construction:

| Failure class | Watched today? | Evidence |
| --- | --- | --- |
| Long-running service stops answering `/health` | **yes** | `HealthWatcher`, 5-min cron |
| Credential expires / is rejected | **yes** | `statex-token-health` timer → Telegram (`09-04 §4.5`) |
| Deploy fails or runs slow | **yes** | deploy-queue `notify.sh` → `DeployFailed` alerts (`09-05 §3.3`) |
| Log senders go quiet | **yes** | `check-ingest-staleness.sh`, 03:45 crontab (`09-04 §4.2`) |
| **Kubernetes Job / CronJob fails** | **no** | 0 job alerts all time (`09-05 §3.3`) |
| **A service logs errors continuously** | **no** | no rule engine in logging (`09-04 §4.2 pt5`) |
| **A host cron / systemd timer fails** | **no**, except one unit | `09-04 §3.2` |
| **A job runs, exits 0, and reports a problem** | **no** | `09-05 §Q-A` |
| **The watcher itself dies** | **no** | `09-04 §7.6` |

Five of those eleven CronJobs are themselves monitors (`09-05 §4.2`). The ecosystem's
watchdogs are its least-watched workloads.

**The generalisable defect:** a signal source may be added to the ecosystem without
anything being obliged to consume it. `catalog-contract-monitor` was written, deployed and
scheduled for 84 days with its output addressed to nobody — and that was *nobody's bug*,
because no rule required a destination. Until that rule exists, this class of incident
recurs indefinitely in whatever surface was added most recently.

This plan therefore has two halves, and **the second half is the one that actually solves
the problem**:

- **A — Close today's gaps.** Add the missing signal sources (Phases 2–5).
- **B — Make new gaps structurally impossible.** A declared-destination rule and a
  machine-checked coverage ledger (Phase 6), so the next surface cannot repeat this.

Delivering A without B buys one incident class. Delivering B is what makes "no quiet
errors" a property of the system rather than a description of this quarter.

---

## 2. Decisions — RESOLVED by owner, 2026-09-05

All four blocking decisions are answered. Recorded verbatim in intent, with the
consequences each one has on the phases below.

### D1 — Kubernetes read access: **APPROVED. Option A.**

> *"monitoring-microservice can have Kubernetes read access. So introduce a cluster-scoped
> identity. Agree. Use option A. K8s API poll."*

Phase 2 proceeds as a Kubernetes API poller inside `monitoring-microservice`. Fallback
option C (host-side guard) is dropped.

**Consequences.** A `ServiceAccount`, `ClusterRole` and `ClusterRoleBinding` must be added
to `k8s/` — the service has none today (`09-05 §3.5`). Because the pod is publicly ingressed
at `monitoring.alfares.cz`, the grant must be minimal and reviewable:

- Verbs limited to `get`, `list`, `watch`. **No `create`, `update`, `patch`, `delete`.**
- Resources limited to `batch/cronjobs`, `batch/jobs`, `pods`, `pods/log`.
- Modelled on the existing reviewed `pod-janitor` ClusterRole, which already grants
  `batch/jobs: get,list` (`09-05 §3.4`).
- `pods/log` is required by invariant I2 (evidence capture) and is the widest part of the
  grant — it can read any pod's logs in the cluster. Call it out explicitly in review rather
  than letting it arrive bundled.

### D2 — Alert destination: **single Telegram chat, unchanged.**

> *"use the same Telegram for all the messages."*

No routing, no new topics, no second credential. Phase 0 loses its routing workstream.

**Consequences — this raises the stakes on noise discipline rather than removing them.**
The chat already carries the daily digest, deploy failures, token findings, ingest
staleness and health alerts, and a `DeployFailed / domain-research` alert stood
unacknowledged for hours on 2026-09-05 (`09-05 §3.3`). Since routing will not absorb the
new volume, the transition-only invariant (I1) and the shipped repeat-backoff are now the
**only** things standing between this work and a muted channel. Concretely:

- No adapter may notify on an occurrence; only on a state transition. Non-negotiable.
- All four adapters reuse `AlertsService.fire()` and its existing dedup, flap damping and
  escalating backoff. No adapter gets its own sender.
- Phase 0 retains the double-digest fix — with one chat, two 08:00 digests are pure noise.
- Add a volume check to the Phase 6 sweep: if daily message count exceeds a threshold, that
  is itself a finding. The 2026-08 incident ran at 46–144 msgs/day against a ~6/day
  baseline (`TASKS.md`); nothing currently measures that automatically.

### D3 — Remediation depth: **autonomous repair, verified by outcome. No PR, no human gate.**

> *"agree with the recommendation: triage automatically, repair under gate for opening
> runlayer goal. But no PR needed - no human involvement needed. Check if service works,
> check the logs after service fix. Errors should disappear after the fix."*

The human merge gate is removed. The loop closes end to end: **detect → alert → runlayer
goal → agent fixes → deploy → verify → confirm or roll back.**

**The gate is not deleted; it is replaced.** The owner has substituted an *outcome* gate for
a *human* gate: a fix is accepted only if the service works and the errors actually stop.
That is a stronger control than a rubber-stamped PR, but only if the verification is real
and the failure path is automatic. Phase 5b is therefore rewritten around a
**verify-or-revert loop** (see below), not around unattended commits.

**One risk the owner should hold explicitly** (raised once here, not re-litigated): the
incident that started this work is a case where the correct fix is a deliberate
security-allowlist judgement, and where the cheapest fix — widening an allowlist to an
admin-capable identity — would reverse a `fix(security)` hardening while making the symptom
disappear (`09-05 §3.2`). **An outcome gate cannot catch that**, because the wrong fix
passes the outcome test: the 401 stops, the service works, the errors vanish.

The `auto_fix_eligible` flag in the Phase 1 ledger is therefore retained as the containment
primitive, and is now the *only* one. Recommended default: surfaces whose last change was a
`fix(security)` commit, and any surface touching auth guards, allowlists, RBAC or token
issuance, are marked ineligible and produce an alert plus a goal for a human, but no
autonomous commit. Everything else runs the full loop. **If the owner wants those included
too, that is a separate explicit decision** — it should not arrive by default.

### D4 — Log-ingestion repair: **rechecked, still broken, deprioritised by owner.**

> *"'speakasap' seems to be redeployed so issue should be fixed. Recheck it. If not, ignore
> for now."*

**Rechecked 2026-09-05 13:36 UTC. Not fixed.** Measured:

- `speakasap` accounts for **1,958 of the last 2,000** logging-microservice log lines, all
  `log_ingest_rejected / missing_credential`. Most recent: `2026-09-05T13:36:04Z`.
- Seven other services are rejected in the same window: `flipflop-api-gateway`,
  `bazos-service`, `aukro-service`, `allegro-service` (8 each), `invoices-microservice`,
  `heureka-service` (4 each), `runlayer` (2).
- **The redeploy could not have fixed it.** The `speakasap` deployment was rolled 25h ago
  (pods 25h old, image `bc208fd`) but carries **no `LOG*` environment variable at all**, and
  none of its secrets contain a `LOGGING_*` key. The credential was never provisioned, so
  no redeploy of the same manifest can change the outcome. This is a missing-secret defect,
  not a stale-image defect.

Per the owner's instruction, this is **not a blocker** and no repair work is scheduled here.
Two consequences carry into Phase 3 and must not be lost:

1. **Phase 3 is scoped to services that demonstrably ship logs.** Error-log rules are built
   only for senders with confirmed successful ingest, enumerated at build time from
   `GET /api/logs/services`. Services in the rejected set are out of scope until credentialed.
2. **The "no errors ⇒ healthy" rule remains permanently forbidden** (I1 corollary). With
   ingestion knowingly broken for at least eight services, absence of error logs carries no
   information whatsoever. This constraint outlives the D4 deferral.

A third consequence touches D3: the owner's verification step — *"check the logs after
service fix, errors should disappear"* — **cannot be evaluated for any service that is not
shipping logs**. Phase 5b's verification must treat "target service has no working log
ingest" as **verification-failed**, not as verification-passed. Otherwise a silent sender
would make every autonomous fix appear to succeed. This is the single most dangerous
interaction between D3 and D4.

## 3. Target architecture

One pipeline, four pluggable source adapters, one existing engine, one gated remediation
arm. **Nothing here is a new application** (owner constraint). Everything except the source
adapters already exists and is running.

```
  SOURCES (new)                  NORMALISE (new)      ENGINE (exists)     ROUTE (exists)      ACT (gated)
  ┌──────────────────────┐
  │ K8s Jobs/CronJobs    │──┐
  │  (Phase 2)           │  │
  ├──────────────────────┤  │    ┌──────────────┐    ┌──────────────┐    ┌─────────────┐   ┌──────────────┐
  │ logging-microservice │──┼───▶│ FailureSignal│───▶│ AlertsService│───▶│Notifications│──▶│ runlayer goal│
  │  error rules (Ph.3)  │  │    │  {source,    │    │  .fire()     │    │  Telegram   │   │              │
  ├──────────────────────┤  │    │ fingerprint, │    │              │    │  (routed    │   │  (Phase 5,   │
  │ host cron / systemd  │──┤    │ severity,    │    │ dedup, flap, │    │   per D2)   │   │   under D3   │
  │  (Phase 4)           │  │    │ evidence}    │    │ backoff,     │    └─────────────┘   │   gate)      │
  ├──────────────────────┤  │    └──────────────┘    │ resolve      │                      └──────────────┘
  │ self-heartbeat       │──┘                        └──────────────┘
  │  (Phase 5)           │                                 │
  └──────────────────────┘                                 ▼
                                                    monitoring.alerts
                                                    (+ evidence column)
```

Three invariants govern every adapter:

- **I1 — Transition-based, never event-based.** Alert on a *change of state*, not on each
  occurrence. This is the only model that survives ~200 identical failures without burying
  the channel (`09-05 §4.2`), and it is the model `token-health` already proves.
- **I2 — Evidence captured at detection time.** A Job outlives its own logs: two failed
  Jobs still exist as API objects while `kubectl logs` on both returns `timed out waiting
  for the condition` (`09-05 §3.4`). A message that says "go look at the pod" is dead on
  arrival. Every alert carries its own tail.
- **I3 — Every adapter emits a heartbeat.** An adapter that dies is the same silent failure
  one level up (`09-04 §7.6`). Absence of a heartbeat is itself an alert condition.

### The normalised signal

A single internal shape all adapters produce, so the engine, routing and remediation stay
source-agnostic and Phase 6's ledger has something uniform to count:

| Field | Purpose |
| --- | --- |
| `source` | `k8s-job` \| `error-log` \| `host-timer` \| `heartbeat` |
| `subject` | what failed — CronJob name, service name, unit name |
| `fingerprint` | dedup key, e.g. `job:catalog-contract-monitor` — reuses the existing partial unique index |
| `severity` | `critical` \| `warning` — existing two-level model |
| `firstDetectedAt` / `lastSeenAt` | drives transition semantics and "how long has this been broken" |
| `evidence` | captured tail / verdict JSON / query result, ≤4096 chars (Telegram bound) |
| `remediationHint` | owning repo, likely cause class, whether the surface is auto-fix eligible |

---

## 4. Phased plan

Phases are ordered by **trust dependency**, not by effort. Each has an explicit exit test
that can be run by a reviewer.

### Phase 0 — Channel hygiene *(prerequisite for all)*

D2 resolved to a single chat, so this phase no longer builds routing. What remains is
ensuring the one channel is not already degraded before three new streams enter it.

1. **Resolve the 08:00 double-digest.** Monitoring's `DailyDigestService` and the host
   `statex-ecosystem-digest.timer` both post to the same chat (`09-04 §4.4`). With one
   destination this is unambiguous noise.
2. **Triage the standing `active` `DeployFailed / domain-research` alert** (`09-05 §3.3`).
   An alert that stands unacknowledged is evidence the channel is under-read; clear it and
   note whether it was ever seen.
3. **Correct `shared/ECOSYSTEM_MAP.md`**, which advertises Grafana at `grafana.alfares.cz`
   that exists nowhere in the cluster or in Docker (`09-05 §3.6`). The map is read order #2
   in `AGENTS.md`, so it actively misinforms agents into believing metric-based alerting
   already covers this gap.
4. **Baseline the message volume.** Record current messages/day before adding sources, so
   the Phase 6 volume check (per D2) has a reference point rather than a guessed threshold.

**Exit test:** exactly one digest arrives at 08:00; no alert is standing unacknowledged;
`ECOSYSTEM_MAP.md` matches `kubectl get ingress -A`; a baseline volume figure is recorded.

### Phase 1 — The coverage ledger *(the spine of the whole plan)*

Depends on: nothing. **Can start immediately.**

Before adding watchers, enumerate what must be watched. A checked-in registry of every
failure-producing surface with its declared destination:

| Column | Example |
| --- | --- |
| `surface` | `cronjob/catalog-contract-monitor` |
| `kind` | `k8s-cronjob` \| `k8s-deployment` \| `host-timer` \| `host-cron` \| `service-logs` |
| `owning_repo` | `catalog-microservice` |
| `failure_destination` | `monitoring:job-watcher` \| `token-health` \| `none` |
| `auto_fix_eligible` | `false` — security surface |

Seeded from measured reality, not from documentation: 11 CronJobs (`09-05 §4.2`), 4 host
crontab entries and 5 systemd user timers (`09-04 §3.2`), 63 registry services, and the
long-running deployments.

The ledger is **not documentation**. It is an executable assertion: a checker compares it
against the live cluster and the host, and reports (a) surfaces with
`failure_destination: none`, and (b) surfaces that exist in reality but not in the ledger.
It is the mechanism that makes Phase 6 enforceable and the only artefact that can answer
"what are we still blind to?" with a number.

**Exit test:** the checker runs, and reproduces today's known-blind list — 11 CronJobs, 4
crontab entries, 8 of 9 systemd timers — without those being hardcoded into it.

### Phase 2 — Kubernetes Job / CronJob watcher *(closes the trigger class)*

Depends on: **D1 (approved — option A)**, Phase 0.

A new watcher in `monitoring-microservice` alongside `HealthWatcher`, same `@Cron` pattern,
same `AlertsService.fire()` sink.

- **Primary signal: `CronJob.status.lastSuccessfulTime`.** It is janitor-proof — the
  janitor deletes pods, never that field — it directly expresses persistence-vs-transience,
  and it survives the evidence window (`09-05 §3.4`).
- **Condition: `now - lastSuccessfulTime > N × schedule_interval`.** This matters
  empirically, not theoretically: in eight days there were **5 transient failures that
  self-healed and 1 persistent failure that did not** (`09-05 §4.2`). A raw "a Job failed"
  trigger has a measured 5:1 false-positive rate on this exact data. The proposed condition
  fires once, for the right one. **Reviewers should challenge N**; `N=3` is a starting
  proposal, not a finding.
- **Poll interval ≤ 15 minutes.** Hard bound is `KEEP_FAILED_MINUTES=120`; anything slower
  sees the corpse without the cause (`09-05 §3.4`). 15 min catches every failure of the
  30-minute `catalog-contract-monitor` with logs intact.
- **Evidence capture (I2):** on detection, pull the failed pod's log tail immediately and
  store it on the alert. Best-effort — sometimes the pod is already gone, and the alert must
  degrade gracefully rather than fail.
- **Also cover one-off `batch/jobs`**, not only CronJob-owned ones — migration Jobs fail the
  same way.

**Exit test — this is the decisive one for the whole plan:** with the watcher deployed and
`catalog-contract-monitor` still broken, an alert appears within one poll interval carrying
the `product-search 401` verdict in its body; and the four CronJobs that had transient
failures in the preceding eight days produce **zero** alerts.

### Phase 3 — Error-log rules *(bounded by what actually ships)*

Depends on: Phase 0. **D4 resolved: ingestion repair is deferred, so this phase is scoped
down rather than blocked.**

The owner asked for this built "on the monitoring side using logs-microservice". That is
right about the owner and **cannot be satisfied literally for job outcomes**: there is no
DaemonSet collector anywhere in the cluster, by a recorded 2026-08-17 decision, so CronJob
stdout never reaches logging-microservice (`09-05 §4.1`). Phase 2 exists precisely because
Phase 3 structurally cannot cover that class.

What Phase 3 covers: sustained error output from long-running services that **demonstrably
ship logs today**.

- **Scope by measurement, not by registry.** Enumerate eligible senders from
  `GET /api/logs/services` — services with confirmed successful ingest. The eight services
  currently rejected (`speakasap` and seven others, `09-05 D4`) are **out of scope** until
  credentialed. Recording them as out-of-scope in the Phase 1 ledger with
  `failure_destination: none` is what keeps the deferral visible instead of forgotten.
- **Transition semantics (I1):** alert when an error rate crosses a threshold *and stays
  there*, never on an error line. Reuse the existing fingerprint and backoff machinery —
  under D2's single chat this is the primary noise control.
- **Never implement "no errors ⇒ healthy."** With ingestion knowingly broken for at least
  eight services, absence of error logs carries no information (`09-05 §4.1`). Such a rule
  would re-create the 2026-07-06 incident with more machinery. Sender liveness is already
  answered by `check-ingest-staleness.sh` and should stay there.
- **Query cost is a real constraint.** Queries are line-by-line scans of rotated JSON files
  with no index on `level`, `service` or `timestamp` (`09-04 §4.2 pt4`). Measure before
  choosing cadence; if scan cost is prohibitive, adding an index to logging-microservice is
  a smaller change than any alternative and is preferable to polling less often.

**Exit test:** a service deliberately emitting sustained errors raises exactly one alert
that escalates on the existing backoff schedule; an occasional single error raises none; a
service known to be rejected at ingest is reported as out-of-scope rather than as healthy.

### Phase 4 — Host-scheduled work

Depends on: Phase 1 (ledger), Phase 0.

Four crontab entries and five systemd user timers are unwatched as a class, with exactly
one exception: `statex-token-health.service` declares
`OnFailure=statex-token-health-failure.service`, added after *"four scheduled runs of the
system unit died on an unwritable state directory without a word reaching anyone"*
(`09-04 §3.2`). That is this same incident, already suffered, already solved — **for one
unit only.**

Generalise it: `OnFailure=` on the remaining timers, and a wrapper for the crontab entries
(cron has no `OnFailure` equivalent). This is the cheapest phase in the plan and closes a
whole class. Note the sudo boundary — the account's sudo is password-gated and unusable
non-interactively (`CONTROL_TERMINAL.md`); these are **user** units under
`~/.config/systemd/user`, so no root is required. Confirm before scheduling.

**Exit test:** deliberately failing a non-critical timer produces a Telegram alert; the
ledger shows zero `host-timer` surfaces with `failure_destination: none`.

### Phase 5 — Self-watch, then autonomous verified repair

Depends on: **D3 (resolved)**, Phases 2–4.

**5a — Dead-man's switch (unconditional, ships with Phase 2).** Every adapter emits a
heartbeat (I3); absence of a heartbeat within a window is itself an alert. A job-failure
watcher that dies silently is the same incident one level up, and `HealthWatcher` does not
monitor itself (`09-04 §7.6`). This becomes *more* important under D3, not less: an
autonomous repair loop whose detector is dead will report nothing while believing all is
well.

**5b — Autonomous repair with an outcome gate.** Per D3 there is no PR and no human
approval. The control is that a fix must **prove itself against reality** and revert
automatically if it cannot. The loop:

```
  alert fires (fingerprint F, surface S, evidence E)
        │
        ├─ S.auto_fix_eligible == false ──▶ alert + goal for a human. STOP. No commit.
        │
        ▼
  create runlayer goal (dedup key = F)   POST /projects/:projectId/goals
        │
        ▼
  agent produces fix ──▶ commit ──▶ deploy queue (serialized, existing lock)
        │
        ▼
  ┌─ VERIFY ─────────────────────────────────────────────────────────┐
  │ V1  deployment rolled out       shared/scripts/wait-for-rollout.sh│
  │ V2  service answers /health     existing HealthWatcher probe      │
  │ V3  the original signal cleared for S:                            │
  │       k8s-job    → a new run completes; lastSuccessfulTime moves   │
  │       error-log  → error rate returns to baseline over window W    │
  │ V4  no NEW alert appeared on any other surface (blast-radius check)│
  └───────────────────────────────────────────────────────────────────┘
        │
   all pass ──▶ resolve F. Post outcome to Telegram. Close goal.
        │
   any fail ──▶ REVERT the commit, redeploy last-known-good,
                re-fire F at critical with "autonomous fix failed",
                mark S ineligible for N hours. Do not retry blindly.
```

Design requirements, each traceable to measured evidence:

- **V3 is the owner's stated test** — *"check if service works, check the logs after service
  fix; errors should disappear."* V2 is "service works"; V3 is "errors disappear". Both are
  required; neither alone is sufficient. A service can be healthy while its job still fails,
  which is exactly the present incident.
- **V3 must fail closed when it cannot observe.** If the target service has no working log
  ingest, verification is **failed**, not passed (D4 consequence 3). Otherwise the eight
  services currently rejected at ingest would make every fix look successful. This is the
  most dangerous interaction in the plan and must be implemented before 5b is enabled.
- **V3 for `k8s-job` surfaces requires waiting for a real scheduled run.** Verification is
  therefore asynchronous and can take up to one schedule interval (30 min for the trigger
  case, 24h for the daily jobs). The loop must hold the goal open, not declare success at
  deploy time. For daily jobs, consider triggering a manual Job from the CronJob template
  rather than waiting a day — `create` on `batch/jobs` is **not** in the D1 grant, so this
  needs either a separate decision or acceptance of the slow path.
- **V4 exists because an autonomous fix has no reviewer.** A change that fixes S and breaks
  T would otherwise be indistinguishable from a success. The existing alert store is the
  blast-radius oracle: no new fingerprints during the verification window.
- **Revert is the failure path, not retry.** A loop that retries a failing fix will consume
  the deploy queue, whose contention behaviour under machine-generated commits is untested
  (`09-04 §6.3`). Bounded attempts per fingerprint, then stop and escalate.
- **Dedup key is the alert fingerprint**, so a flapping detector cannot open a goal per
  cycle. Monitoring's fingerprint dedup and runlayer's `LOOPING_GOAL_CYCLE_LIMIT` both exist
  but have never been composed (`09-04 §6.3`) — budget for that as real work.
- **Every autonomous action is announced.** Goal opened, commit made, verification result,
  revert if any — all to the single Telegram chat (D2). Autonomy without narration
  reproduces the original defect at a higher level: things happening that nobody knows about.
- **Deployment serialization is respected.** All deploys go through the existing queue and
  `shared/scripts/deploy.sh`; the loop never bypasses the lock (`AGENTS.md`).

**Exit test:** a synthetic failure on an eligible surface produces one alert, one goal, one
commit, and a verified resolution announced in Telegram. A deliberately bad fix is reverted
automatically and re-alerts at `critical`. A failure on an ineligible surface produces an
alert and a goal but **no commit**. A fix targeting a service with broken log ingest is
reported as verification-failed, not success.

### Phase 6 — Make the gap structurally impossible *(the actual objective)*

Depends on: Phase 1.

Phases 2–5 close the gaps that exist on 2026-09-05. Phase 6 is what stops the list
regrowing.

1. **Declared-destination rule.** No scheduled workload, and no new service, may be created
   without declaring where its failures go. Homes: `shared/docs/CREATE_SERVICE.md` and the
   IPS integration contract, which already require deliberate review of every integration
   capability. This turns "did anyone wire up alerting?" from a thing someone might remember
   into a thing the process asks.
2. **Ledger enforcement in CI or the daily sweep.** A surface in the cluster but not in the
   ledger, or in the ledger with `failure_destination: none`, is a finding — reported the
   same way `check-ingest-staleness.sh` reports quiet senders. This is the difference
   between a policy and a check.
3. **Runtime state in the daily digest.** The 08:00 digest reads `TASKS.md`, `STATE.json`
   and checkbox counts, never calls kubectl, and reported green on both days the CronJob was
   broken (`09-04 §4.4`). **A heartbeat that is green while production is red is worse than
   no heartbeat, because it is read as reassurance.** It should carry coverage counts and
   open-alert counts.
4. **Drift check on `ECOSYSTEM_MAP.md`.** Stale entries such as the phantom Grafana
   (`09-05 §3.6`) cause exactly the false assurance this plan exists to eliminate, and the
   map is authoritative read order #2. Cheap, and the same class of check as ingest
   staleness (`09-05 §Q-C`).

**Exit test:** adding a CronJob to the cluster without a ledger entry produces a finding
within one sweep. This is the only exit test that proves the *class* is closed rather than
the instances.

---

## 5. Sequencing

All four decisions are resolved, so nothing is decision-blocked. Remaining order is driven
by trust dependency.

```
  Phase 1 (ledger) ──── no deps, START NOW ────┐
                                               │  ledger supplies auto_fix_eligible,
  Phase 0 (channel hygiene) ───────┐           │  without which 5b must not run
                                   │           │
                                   ▼           │
                      Phase 2 (K8s watcher) ───┤
                      + Phase 5a (heartbeat)   │
                        ship together          │
                                   │           │
                      Phase 4 (host timers) ───┤
                                   │           │
                      Phase 3 (error rules) ───┤
                       scoped to real senders  │
                                               ▼
                                    Phase 5b (autonomous verified repair)
                                     gated on: ledger eligibility + V3 fail-closed
                                               │
                                               ▼
                                    Phase 6 (declared-destination rule)
```

Three ordering constraints are hard, not preferences:

1. **Phase 5a ships with Phase 2, never after.** An autonomous loop with an unmonitored
   detector is strictly worse than no loop: it reports success by silence.
2. **Phase 5b must not start before Phase 1's ledger and V3's fail-closed behaviour exist.**
   Those are the only two controls left after D3 removed the human gate (R3, R10).
3. **Phase 1 starts immediately.** It has no dependencies, it is the artefact that makes
   every later phase measurable, and it is the only deliverable still useful if the plan is
   rescoped.

Phase 2 remains the highest value per unit of effort — it closes the class that produced
the incident. Phase 6 remains the highest value overall and the easiest to drop under time
pressure, which is why §1 names it as the objective rather than listing it last.

## 6. Risks

Updated for the resolved decisions. R2 and R3 changed materially; R10 and R11 are new and
arise directly from D3's removal of the human gate.

| # | Risk | Mitigation |
| --- | --- | --- |
| R1 | **Channel saturation.** D2 keeps one chat carrying five existing streams plus three new ones; an alert already stood unacknowledged (`09-05 §3.3`) | Transition-only (I1) is now the sole control. All adapters reuse the shipped dedup/flap/backoff. Volume check added to the Phase 6 sweep with a Phase 0 baseline |
| R2 | **Cluster RBAC on a public-ingress service.** Accepted under D1 | Read-only verbs on `batch/*` and `pods` only; `pod-janitor` as the reviewed precedent. `pods/log` is the widest grant and must be called out explicitly in review |
| R3 | **An autonomous fix reverses a security hardening.** The trigger incident is the worked example, and an outcome gate cannot catch it — the wrong fix passes every test (`09-05 §3.2`) | Ledger `auto_fix_eligible: false` on auth/allowlist/RBAC/token surfaces and anything last touched by a `fix(security)` commit. This is now the **only** containment; it must be implemented before 5b is enabled |
| R4 | **Alerting on logs while ingestion is broken** — confidently silent for the wrong reason | Phase 3 scoped to confirmed senders. "No errors ⇒ healthy" permanently forbidden |
| R5 | **Log-query scan cost.** No index; O(n) file scan per cycle | Measure before choosing cadence. Prefer adding an index over polling less often |
| R6 | **The watcher dies silently** — the same incident one level up, and worse under autonomy | Phase 5a ships **with** Phase 2, not after |
| R7 | **Deploy-queue contention** from machine-generated commits is untested (`09-04 §6.3`), and D3 removes the human rate-limiter | Bounded attempts per fingerprint; revert-not-retry; all deploys through the existing serialized queue; never bypass the lock |
| R8 | **Duplicate goals** from a flapping detector | Fingerprint as dedup key, composed with `LOOPING_GOAL_CYCLE_LIMIT` — an untested composition, budget for it |
| R9 | **The plan delivers A and drops B**, and the class regrows | Phase 6 is named as the objective in §1; its exit test is the only one proving the class is closed |
| **R10** | **False-verified fix.** A fix "verifies" because the target ships no logs, so V3 cannot observe errors either way — eight services are in that state today | V3 **fails closed**: no working ingest ⇒ verification failed. Must ship before 5b is enabled |
| **R11** | **Silent autonomy.** Fixes land with no reviewer and no announcement, reproducing the original defect one level up: things happening that nobody knows about | Every autonomous action announced to Telegram — goal, commit, verification result, revert. V4 blast-radius check catches collateral breakage |

## 7. Explicitly out of scope

### 7.1 The `catalog-microservice` fix

The trigger, not the work. It belongs in `catalog-microservice`
(`monitoring-microservice/TASKS.md:131-138`, `09-04 §2.3`). Recorded here only so the
alerting lane is not blocked on it, and so whoever takes it knows it is **two fixes, not
one** (`09-05 §3.1`):

1. The internal-service path — `catalog-authorized-smoke` is not in the guard's 11-name
   allowlist, and `CATALOG_INTERNAL_SERVICE_NAMES` is absent from the ConfigMap. **The
   obvious fix is the dangerous one**: the monitor's `JWT_TOKEN` carries `catalog:write`
   and two admin roles, so a careless remedy widens the shared-secret allowlist to an
   admin-capable identity. Decide the minimum role per contract first (`09-05 §3.2`).
2. The bearer path — returns 401 `Token validation failed` **today**, not merely on its
   2026-09-11 expiry. Fixing only path 1 leaves a credential that is already dead.

Its `product-search` verdict is also the natural end-to-end test for Phase 2: a real,
currently-failing job whose alert content can be checked against a known-correct answer.

### 7.2 Detector expressiveness

`catalog-contract-monitor` exits 1 both when it cannot authenticate and when it finds a
genuine contract breach, and its "anonymous" profile never sends anonymous requests
(`09-05 §3.1`, `09-04 §2.3`). A future fix that makes such a monitor exit 0-with-findings
would become invisible again — a *run* channel is not a *result* channel (`09-05 §Q-A`).
Worth a follow-up lane; not a blocker for this one.

### 7.3 Noted, unowned

Surfaced by the assessments, outside this plan, should not be lost:

- `webhook-delivery.service.ts` auto-suspends failing subscriptions and logs *"Suspension
  alert logged (email/Telegram notification not implemented)"* — the same silent-failure
  pattern in a different service (`09-05 §4.3`).
- `monitoring.incidents` table exists with no writer in `src/` — dead table or unfinished
  feature; resolve before Phase 5 invents a parallel incident model.
- Static-token auth warnings flood `notifications-microservice` logs continuously; the
  RS256 migration is incomplete in production.

---

## 8. Implementation readiness checklist

The reviewer questions are closed; these are the gates an implementer must pass. The first
three are the ones that make autonomy safe and must not be deferred.

1. **Ledger exists with `auto_fix_eligible` populated** before any autonomous commit is
   possible. Auth guards, allowlists, RBAC and token issuance default to ineligible, as do
   surfaces last touched by a `fix(security)` commit (R3).
2. **V3 fails closed on unobservable targets.** A service with no working log ingest yields
   *verification failed*. Test this explicitly against one of the eight currently rejected
   services before enabling 5b (R10, D4).
3. **Phase 5a heartbeat is live** and its absence alerts, shipped with Phase 2 (R6).
4. RBAC is read-only: `get`/`list`/`watch` on `batch/cronjobs`, `batch/jobs`, `pods`,
   `pods/log`. No write verbs. `pods/log` breadth acknowledged in review (D1).
5. `N` in `lastSuccessfulTime > N × interval` is chosen and justified against the measured
   5:1 transient-to-persistent ratio. Proposal `N=3`; confirm or change with reasoning.
6. Poll interval ≤ 15 minutes, satisfying the `KEEP_FAILED_MINUTES=120` evidence bound.
7. Every adapter is transition-based and routes through `AlertsService.fire()`. No adapter
   has its own sender — the single-chat decision makes this the primary noise control (D2).
8. Verification for `k8s-job` surfaces waits for a real scheduled run. If manual Job
   triggering is wanted instead, `create` on `batch/jobs` is a **separate RBAC decision**
   not covered by D1.
9. Revert-not-retry is implemented, with bounded attempts per fingerprint and automatic
   re-alert at `critical` on failure (R7).
10. Every autonomous action is announced to Telegram: goal, commit, verification result,
    revert (R11).
11. Phase 6's declared-destination rule lands in `shared/docs/CREATE_SERVICE.md` and the IPS
    integration contract, with the ledger check running in the daily sweep. **Without this
    the class regrows** — it is the objective, not the epilogue.
12. The `catalog-microservice` fix is tracked separately as **two fixes, not one** (§7.1),
    and its `product-search` verdict is used as the Phase 2 end-to-end test.

**Deferred by owner decision, recorded so it is not lost:** log-ingestion repair for
`speakasap` and seven other services (D4). The credential was never provisioned — no
redeploy can fix it. Every one of those services is invisible to Phase 3 and unverifiable by
Phase 5b for as long as this stands.
