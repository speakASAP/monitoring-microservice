# EP-TASK-006: Failure-signal coverage — a system that cannot fail quietly

```yaml
id: EP-TASK-006
status: draft
source_task: TO BE CREATED ON APPROVAL (docs/11_tasks/TASK-006-failure-signal-coverage.md)
owner: unassigned — pending owner approval
created: 2026-09-05
last_updated: 2026-09-05
completeness_level: draft
```

## Metadata

**Status:** DRAFT — proposal for review. **No code, config or cluster state has been
changed.** The IPS chain (task, milestone, feature, goal-impact, context package) is
deliberately *not* created yet: §2 contains four decisions that change the shape of the
work, and manufacturing the chain before they are answered would encode guesses as
traceability.

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

## 2. Decisions required before implementation

These four cannot be resolved by research; they are owner or reviewer judgement. Work on
the dependent phases must not start until each is answered. Recommendations are given, with
the evidence that supports them.

### D1. May `monitoring-microservice` hold Kubernetes read access? — **blocks Phase 2**

It runs with **no ServiceAccount at all** today and is publicly ingressed at
`monitoring.alfares.cz` (`09-05 §3.5`). So this is not "extend a role"; it is "introduce a
cluster-scoped identity to an internet-facing service".

| Option | Sees crash / OOM / never-started? | New security surface | Placement |
| --- | --- | --- | --- |
| **A. K8s API poll** from monitoring | **yes** | ServiceAccount + ClusterRole (`batch/jobs`, `batch/cronjobs`, `pods`: get/list) on an ingressed pod | matches owner's stated placement |
| **B. Jobs self-report** | **no** — a job that dies reports nothing | none | edits in 8 repos |
| **C. Host-side guard** (systemd timer + node kubectl) | **yes** | none — no new identity | outside monitoring, conflicts with stated placement |

**Recommendation: A, narrowed.** B cannot detect the failures that matter most
(`09-04 §7.1`). C is the proven local pattern (`token-health`) but puts the capability
outside the service the owner named. A can be narrowed to read-only verbs on `batch/*` and
`pods`, modelled on the existing reviewed `pod-janitor` ClusterRole (`09-05 §3.4`).
**If D1 is refused, Phase 2 switches to C** and the rest of the plan is unaffected — this
is a placement decision, not an architecture decision.

### D2. Where do these alerts land? — **blocks every phase**

Everything currently lands in one owner chat: daily digest, deploy failures, token
findings, ingest staleness, health alerts (`09-04 §4.3`). A `DeployFailed / domain-research`
alert fired at 10:02 on 2026-09-05 and was **still `active` and unacknowledged** hours
later (`09-05 §3.3`) — weak but real evidence the channel is already under-read.

Adding three new alert streams to that chat risks the mute-the-channel failure that
`token-health-guard.sh` explicitly warns about. **Recommendation: severity routing to
separate Telegram topics** — `critical` (paging), `warning` (working stream), `digest`
(daily) — reusing the existing bot and borrowing credentials the way `notify.sh` does,
rather than minting a second credential (`09-04 §4.3`). Resolve the possible 08:00
double-digest (`09-04 §4.4`) in the same pass.

### D3. How far does automated remediation go? — **blocks Phase 5**

The trigger incident is a counter-example to naive auto-fix. The correct remedy is a
deliberate security-allowlist judgement plus a credential re-issue on an admin-capable
token (`09-05 §3.1`, `§3.2`) — exactly the judgement `b99a38c` and `3fb296a` were written
to force a human to make. An agent optimising for "make the 401 go away" would reverse a
security hardening (`09-04 §6.3`).

There is also a **reachability problem** that must be answered honestly before effort is
committed (`09-05 §Q-B`): roughly half of plausible job failures are credential expiry or
identity rejection — all security surfaces, all excluded from auto-fix. If the common case
is out of scope, what fraction of "start fixing automatically" is actually attainable?

**Recommendation: triage automatically, repair under gate.** Alert → auto-open a runlayer
goal / GitHub issue carrying captured evidence → agent produces a diff and a PR → human
approves the merge. This closes the "nobody knows" gap entirely and most of the "nobody
starts" gap, keeps humans on security surfaces, and reuses `goal-review.service.ts`'s
existing `gh pr create` path rather than inventing one (`09-04 §6.1`, `§6.3`).

### D4. Is repairing log ingestion a prerequisite or a parallel lane? — **blocks Phase 3**

`speakasap` is still being rejected with `missing_credential` **today**, despite TASK-LOG-005
being marked complete on 2026-09-04 (`09-05 §4.1`). Eleven services were found shipping
nothing at all (`09-04 §4.2 pt2`).

**Recommendation: prerequisite.** Error-log alerting on top of broken ingestion produces a
system that is *confidently silent for the wrong reason* — precisely the 2026-07-06 failure,
repeated with more machinery. Any rule of the form "no errors seen ⇒ healthy" is unsound
until ingestion is trustworthy.

---

## 3. Target architecture

One pipeline, four pluggable source adapters, one existing engine, one gated remediation
arm. **Nothing here is a new application** (owner constraint). Everything except the source
adapters already exists and is running.

```
  SOURCES (new)                  NORMALISE (new)      ENGINE (exists)     ROUTE (exists)      ACT (gated)
  ┌──────────────────────┐
  │ K8s Jobs/CronJobs    │──┐
  │  (Phase 2)           │  │
  ├──────────────────────┤  │    ┌─────────────┐    ┌──────────────┐    ┌───────────┐    ┌──────────────┐
  │ logging-microservice │──┼───▶│ FailureSignal│───▶│ AlertsService│───▶│Notifications│──▶│ runlayer goal│
  │  error rules (Ph.3)  │  │    │  {source,    │    │  .fire()     │    │  Telegram   │   │  / gh issue  │
  ├──────────────────────┤  │    │ fingerprint, │    │              │    │  (routed    │   │  (Phase 5,   │
  │ host cron / systemd  │──┤    │ severity,    │    │ dedup, flap, │    │   per D2)   │   │   under D3   │
  │  (Phase 4)           │  │    │ evidence}    │    │ backoff,     │    └──────────────┘   │   gate)      │
  ├──────────────────────┤  │    └─────────────┘    │ resolve      │                        └──────────────┘
  │ self-heartbeat       │──┘                       └──────────────┘
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

### Phase 0 — Establish trust in the channel *(prerequisite for all)*

Depends on: **D2**.

Nothing else should ship into a channel that is already at risk of being muted.

1. Implement severity routing (per D2), reusing the existing bot and the `notify.sh`
   credential-borrowing rule (`09-04 §4.3`).
2. Resolve the 08:00 double-digest — monitoring's `DailyDigestService` and the host
   `statex-ecosystem-digest.timer` both post to the same chat (`09-04 §4.4`).
3. Triage the standing `active` `DeployFailed / domain-research` alert (`09-05 §3.3`).
4. Correct `shared/ECOSYSTEM_MAP.md`, which still advertises Grafana at
   `grafana.alfares.cz` that exists nowhere in the cluster or Docker (`09-05 §3.6`). The
   map is read order #2 in `AGENTS.md`, so this actively misinforms reviewing agents into
   believing metric-based alerting already covers this gap.

**Exit test:** a `critical` and a `warning` test alert arrive in distinguishable
destinations; exactly one digest arrives at 08:00; `ECOSYSTEM_MAP.md` matches
`kubectl get ingress -A`.

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

Depends on: **D1**, Phase 0.

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

### Phase 3 — Error-log rules *(the owner's stated preference, honestly bounded)*

Depends on: **D4**, Phase 0.

The owner asked for this to be built "on the monitoring side using logs-microservice". That
is right about the owner and **cannot be satisfied literally for job outcomes**: there is no
DaemonSet collector anywhere in the cluster, by a recorded 2026-08-17 decision, so CronJob
stdout never reaches logging-microservice (`09-05 §4.1`). Phase 2 exists precisely because
Phase 3 structurally cannot cover that class.

What Phase 3 *can* cover: sustained error output from long-running services that already
POST logs.

- **After D4 is satisfied** — ingestion repaired, `speakasap` and the 11 silent services
  shipping.
- Poll `GET /api/logs/query?level=error` on a rules interval. Note the cost: queries are
  line-by-line scans of rotated JSON files with **no index** on `level`, `service` or
  `timestamp` (`09-04 §4.2 pt4`). Rule cadence is a capacity question — measure before
  choosing. If scan cost proves prohibitive, adding an index to logging-microservice is a
  smaller change than any alternative and should be preferred over polling less often.
- **Transition semantics (I1):** alert on *error rate crossing a threshold and staying
  there*, not on any error line. Reuse the existing fingerprint/backoff machinery.
- **Explicitly do not** implement a "no errors ⇒ healthy" rule. Absence of error logs
  currently means nothing (`09-05 §4.1`), and such a rule would re-create the 2026-07-06
  incident with more machinery. Sender liveness is already covered by
  `check-ingest-staleness.sh` and should remain the answer to that question.

**Exit test:** a service deliberately emitting sustained errors raises exactly one alert
that escalates on the existing backoff schedule; a service emitting an occasional single
error raises none.

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

### Phase 5 — Self-watch, then gated remediation

Depends on: **D3**, Phases 2–4.

**5a — Dead-man's switch (do this first, unconditionally).** Every adapter emits a
heartbeat (I3); absence of a heartbeat within a window is itself an alert. A job-failure
watcher that dies silently is the same incident one level up, and `HealthWatcher` does not
monitor itself (`09-04 §7.6`). **Phase 5a must ship before or with Phase 2 — not after.**
A watcher whose own death is invisible is only a redistribution of the problem.

**5b — Remediation, at the depth D3 permits.** Under the recommended "triage
automatically, repair under gate":

- On a `critical` alert whose surface is `auto_fix_eligible` in the ledger, create a
  runlayer goal via `POST /projects/:projectId/goals` (`09-04 §6.1`) carrying the captured
  evidence, or open a GitHub issue via the existing `goal-review.service.ts` path.
- **Dedup key = the alert fingerprint**, so a flapping detector cannot open a goal per
  cycle. Monitoring's fingerprint dedup and runlayer's `LOOPING_GOAL_CYCLE_LIMIT` both
  exist but *have never been composed* (`09-04 §6.3`) — composing them is real work, not a
  configuration step.
- **Security surfaces are excluded by the ledger**, not by agent judgement. `fix(security)`
  surfaces set `auto_fix_eligible: false`. The trigger incident is the worked example of why
  (`09-05 §3.2`).
- Human approves the merge. No automated change reaches production unreviewed.

**Exit test:** a synthetic failure on an eligible surface produces one alert and exactly one
goal/issue with evidence attached; a repeat within the backoff window produces neither a
second goal nor a second issue; a failure on an ineligible surface produces an alert and
**no** automated action.

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

```
D1 ─────────────────────────┐
D2 ──┐                      │
D4 ──┼──┐                   │
D3 ──┼──┼───────────┐       │
     ▼  │           │       ▼
   Phase 0 ─────────┼──▶ Phase 2 (K8s watcher) ──┐
     │              │       ▲                    │
     │              │       │ 5a ships with ─────┤
   Phase 1 ─────────┼───────┴──▶ Phase 4 ────────┤
   (ledger,         │                            │
    no deps,        └──▶ Phase 3 (error rules) ──┤
    start now)                                   │
                                                 ▼
                                        Phase 5b (gated remediation)
                                                 │
                                                 ▼
                                        Phase 6 (structural rule)
```

Phase 1 has no dependencies and should start immediately — it is the artefact that makes
every later phase measurable, and it is the one deliverable that is useful even if the plan
is subsequently rescoped. Phase 2 is the highest value per unit of effort: it closes the
class that produced the incident. Phase 6 is the highest value *overall* and the easiest to
drop under time pressure, which is precisely why it is named as the objective in §1 rather
than listed last as a nicety.

---

## 6. Risks

| # | Risk | Mitigation |
| --- | --- | --- |
| R1 | **Channel saturation.** Three new streams into a chat already carrying five, one alert already unacknowledged (`09-05 §3.3`) | D2 routing is a Phase 0 prerequisite, not a follow-up. Transition-only semantics (I1). Reuse shipped backoff |
| R2 | **New cluster RBAC on a public-ingress service** (`09-05 §3.5`) | D1 gate. Read-only verbs, `pod-janitor` as the reviewed precedent. Fallback to option C loses no capability |
| R3 | **Auto-fix reverses a security hardening.** The trigger incident is the worked example (`09-05 §3.2`) | Ledger-level `auto_fix_eligible: false` on security surfaces. Human merge gate. D3 |
| R4 | **Alerting on logs while ingestion is broken** — confidently silent for the wrong reason, repeating 2026-07-06 | D4 as prerequisite. No "no errors ⇒ healthy" rule, ever |
| R5 | **Log-query scan cost.** No index; O(n) file scan per rule cycle (`09-04 §4.2 pt4`) | Measure before choosing cadence. Prefer adding an index over polling less often |
| R6 | **The watcher dies silently** — the same incident one level up | Phase 5a ships with Phase 2, not after |
| R7 | **Deploy-queue contention** from agent-generated commits is untested (`09-04 §6.3`) | Human merge gate bounds commit rate. Do not automate merges |
| R8 | **Duplicate goals/issues** from a flapping detector | Fingerprint as dedup key; compose with `LOOPING_GOAL_CYCLE_LIMIT` — untested composition, budget for it |
| R9 | **The plan delivers A and drops B**, and the class regrows | Phase 6 named as the objective in §1; its exit test is the only one that proves the class is closed |

---

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

## 8. Reviewer checklist

1. Do you accept the framing in §1 — that this is a **coverage** problem, and that the
   engine and delivery are not the gap (`09-05 §3.3`)?
2. **D1**: may monitoring hold cluster read, priced as "new identity on a public-ingress
   service" rather than "extend a role"? If no, is fallback C acceptable?
3. **D2**: what is the routing model, and do you agree Phase 0 blocks everything?
4. **D3**: what remediation depth? Answer the reachability question — if credential and
   security failures are the common case and are excluded, what remains automatable?
5. **D4**: is log-ingestion repair a prerequisite? If you say parallel, how do you avoid
   re-creating 2026-07-06?
6. Is `lastSuccessfulTime > N × interval` the right primary condition, given the measured
   5:1 transient-to-persistent ratio? **What is N?**
7. Is a ≤15-minute poll interval agreed, given `KEEP_FAILED_MINUTES=120`?
8. Do you accept I1/I2/I3 as invariants binding on every future adapter?
9. Do you agree Phase 5a (dead-man's switch) ships **with** Phase 2, not after?
10. **Is Phase 6 in scope?** If it is dropped, this plan closes today's gaps and the class
    regrows at the next surface. Say so explicitly rather than by omission.
11. Is Phase 1's ledger the right enforcement artefact, or is there a lighter mechanism that
    is still machine-checkable?
12. Who owns this lane, and does it supersede or run alongside `GOAL-IMPACT-TASK-005`?
