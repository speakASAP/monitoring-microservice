# EP-TASK-007: Close the loop — from detection to verified autonomous repair

```yaml
id: EP-TASK-007
status: draft-for-review
source_task: TO BE CREATED ON APPROVAL (docs/11_tasks/TASK-007-close-the-loop.md)
owner: unassigned — decisions approved 2026-09-06, implementation owner TBD
created: 2026-09-06
last_updated: 2026-09-06
completeness_level: draft-for-review
supersedes: nothing. Continues EP-TASK-006 (Phases 1-5a delivered).
```

## Metadata

**Status:** DRAFT. **No code, config or cluster state has been changed by this document.**

**Evidence base:** [`docs/09_assessments/2026-09-06-silent-failure-day3-verification.md`](../09_assessments/2026-09-06-silent-failure-day3-verification.md)
(day-3 measurement) and [`EP-TASK-006`](EP-TASK-006-failure-signal-coverage.md) (owner
decisions D1–D4, Phase 5b loop specification). Gap numbering `[GAP-n]` is continuous with
the day-3 assessment. This plan adds no new facts; it converts measured gaps into
parallelisable work.

**What already shipped (EP-TASK-006, do not rebuild):** the coverage ledger and its live
checker, `JobWatcher`, `ErrorLogWatcher`, `HeartbeatService`, host-job wrappers, the
read-only Kubernetes grant, and `RepairGate`/`RepairVerifier` in shadow mode. All verified
running on image `5ccb4e5`.

**What this plan closes:** the loop is `detect → alert → blocked`. Every one of 18 repair
attempts blocked; autonomy has no execution backend; and the alerts it would act on do not
contain the cause. This plan makes the loop reach `→ fix → verify → confirm or revert`.

---

## 1. Owner decisions governing this plan

Recorded 2026-09-06. These are settled inputs, not open questions. D1–D4 from EP-TASK-006
remain in force and are not re-litigated.

| # | Decision | Consequence |
| --- | --- | --- |
| **D5** | **Catalog fix is in scope, own agent, top priority.** | Both faults (401 allowlist + token rotation) fixed before 2026-09-11. Runs fully parallel; touches no monitoring code. |
| **D6** | **Build autonomy and enable it on eligible surfaces.** | Not shipped disabled. The full verify-or-revert loop goes live at the end of this plan. |
| **D7** | **Scope: GAP-2, GAP-3, GAP-9, GAP-6, GAP-7, GAP-8.** | GAP-5 was initially excluded, then included by D8. |
| **D8** | **GAP-5 included; autonomy is gated behind it.** | An out-of-process dead-man's switch must be live *before* `REPAIR_MODE=active`. |
| **D9** | **RBAC stays read-only. Accept slow verification.** | No `create` on `batch/jobs`. V3 waits up to one schedule interval — 30 min for the trigger case, 24h for daily jobs. The read-only guarantee is preserved. |
| **D10** | **Global rate limit plus auto-disable on revert.** | Bounded attempts per fingerprint (already specified in §5b) are *not* sufficient. A global ceiling across all surfaces, and any revert disables autonomy globally until a human re-enables. |
| **D11** | **Channel volume reduced mechanically; D2 unchanged.** | No routing, no second chat. GAP-9 and GAP-2 remove the mechanical inflation, then re-measure. |

**D10 rationale, stated once:** with no human gate (D3) and no PR review, the only thing
between a bad autonomous change and a bad night is the rate limit. Per-fingerprint bounds
let N surfaces each run their own loop concurrently. The global ceiling is what makes the
blast radius bounded rather than merely bounded-per-problem.

---

## 2. Dependency structure — why the obvious split is wrong

A reviewer's instinct is to split by gap number: one agent takes GAP-1, another GAP-2. That
fails on two counts.

1. **GAP-2 is a prerequisite for GAP-1, not a peer.** The gate blocks every
   `ServiceLoggingErrors` alert as an unregistered surface, so an agent building the
   execution backend cannot reach an `allow` to test against. It would ship an actuator
   that has never once fired.
2. **GAP-3 is a prerequisite for GAP-1 being *worth* building.** Wiring an agent to
   evidence that omits the cause produces an agent that guesses. Verified empirically: the
   live `catalog-contract-monitor` alert contains only "optional contract skipped"
   boilerplate; the `401` is absent.

So the split is **by file ownership and by dependency layer**, not by gap number.

```
      ┌──────────────────────────────────────────────────────────────┐
 WAVE │  A: catalog fix        B: evidence       C: signal hygiene   │
  1   │  (catalog-micro)       (job-watcher)     (error-log-watcher, │
      │   D5, deadline 09-11    GAP-3             ledger) GAP-9,GAP-2│
      └──────────────────────────────────────────────────────────────┘
                    │                  │                  │
                    │           ┌──────┴──────────────────┘
                    │           │  (B and C both gate D)
      ┌─────────────┼───────────┼──────────────────────────────────┐
 WAVE │  E: delivery + hygiene  │  D: autonomy backend             │
  2   │  (notifications)        │  (repair/, runlayer integration) │
      │   GAP-6, GAP-7, GAP-8   │   GAP-1, GAP-5, D10 controls     │
      └─────────────────────────┴──────────────────────────────────┘
                                       │
      ┌────────────────────────────────┴──────────────────────────────┐
 WAVE │  F: enable autonomy — single serialized step, human-triggered  │
  3   │      gated on V-A..V-E all green                              │
      └───────────────────────────────────────────────────────────────┘
```

**Wave 1 agents (A, B, C) run fully in parallel. No shared files.**
**Wave 2: E is parallel with D. D may not start until B and C are merged.**
**Wave 3 is one step, not an agent. It requires a human to trigger.**

### File ownership — no two agents touch the same file

| Agent | Owns exclusively | Must not touch |
| --- | --- | --- |
| A | `catalog-microservice/**` | anything in `monitoring-microservice` |
| B | `monitoring-microservice/src/alerts/job-watcher.ts` + its spec | `error-log-watcher.ts`, `repair/**`, `failure-surfaces.ts` |
| C | `src/alerts/error-log-watcher.ts`, `src/config/failure-surfaces.ts` + specs | `job-watcher.ts`, `repair/**` |
| D | `src/repair/**`, `src/k8s/kube-client.ts`, `k8s/configmap.yaml` | `job-watcher.ts`, `error-log-watcher.ts` |
| E | `notifications-microservice/**`, `src/common/notifications/notifications.client.ts` | `repair/**`, watchers |

Per `AGENTS.md` "Concurrent agent sessions": each agent announces ownership before editing
and re-checks with `ListAgents` if a file outside its column becomes necessary. A change
outside the owned column is a **stop-and-negotiate**, not a judgement call.

---

## 3. Wave 1 — three parallel agents

### Agent A — the trigger incident *(D5, hard deadline 2026-09-11T07:18:51Z)*

**Repo:** `catalog-microservice`. **Depends on:** nothing. **Blocks:** nothing.

Two independent faults. Fixing one leaves the other; fixing only the token means the job
breaks again on 09-11 for a different reason.

**A1 — The `401` on `/api/products/search`.** The 2026-09-01 hardening (`3fb296a`,
`fc2f81c`) tightened both credential paths without updating this caller. The remedy is a
deliberate decision about whether `catalog-contract-monitor` is a legitimate caller and
what roles it should hold — decided in `src/auth/catalog-auth.guard.ts`
(`rolesForServiceName` L184-233, default allowlist L260-276).

> **This is a `fix(security)` surface.** The cheapest fix — widening the allowlist to an
> admin-capable identity — would reverse a deliberate hardening while making the symptom
> disappear. EP-TASK-006 §D3 records that an outcome gate cannot catch this, because the
> wrong fix passes every outcome test. Agent A proposes the allowlist change and its
> reasoning; **a human approves the specific roles granted before it merges.** This is the
> one human gate in the whole plan and it is deliberate.

**A2 — Token rotation.** `JWT_TOKEN` in `catalog-microservice-secret` expires
2026-09-11T07:18:51Z. Rotate per `vault-secret` skill conventions. Never print the value;
record only `sha256(value)[0:8]` and the new `exp`.

**A3 — Confirm the monitor's own contract.** `catalog-contract-monitor.js` sets
`process.exitCode = 1` and reports to nobody (day-3 §6). It is now watched by `JobWatcher`,
so this is no longer a silent-failure risk — but confirm the job exits non-zero for the
right reasons and that a *passing* run is distinguishable from a *skipped* one.

**Validation V-A** — all four required:
- `VA-1` `kubectl get cronjob catalog-contract-monitor -n statex-apps -o jsonpath='{.status.lastSuccessfulTime}'` moves to a timestamp after the fix deploys.
- `VA-2` `CronJobNotSucceeding / catalog-contract-monitor` transitions to `resolved` in `monitoring.alerts` **without manual intervention** — this is the end-to-end proof that detection, resolution and recovery-announcement all work.
- `VA-3` decoded `exp` of the new token is ≥ 30 days out. Value never printed.
- `VA-4` a human has signed off on the specific roles granted in A1. Record who and when.

---

### Agent B — evidence must carry the cause *(GAP-3)*

**Repo:** `monitoring-microservice`. **Owns:** `src/alerts/job-watcher.ts`.
**Blocks:** Agent D.

`job-watcher.ts:297` truncates with `text.slice(-max)` — the last 900 chars. Verified
against the live alert row: the stored evidence is entirely "optional contract skipped"
boilerplate and the `401` does not appear. Invariant I2 is implemented in mechanism and
defeated in practice.

**B1 — Do not simply flip the slice direction.** Some failures put the cause last (a stack
trace), others first (this one). Head-only fails the opposite class. Required behaviour:
capture **both ends** with a marked elision, or filter for error-shaped lines, or both.
The test is not "which end" but "is the cause present".

**B2 — Store the full tail on the alert row.** `JOB_EVIDENCE_TAIL_LINES=120` is already
fetched; the `labels` JSONB column already carries the untruncated copy by design. Confirm
the truncation applies only to the Telegram-bound `message`, never to what an agent reads.
This matters directly for Agent D: the repair loop must read the full evidence, not the
4096-char-safe rendering.

**B3 — Regression test against the real artifact.** Use the actual
`catalog-contract-monitor` pod output as a fixture. The test asserts the `401` appears in
captured evidence. That fixture is the whole point of the gap.

**Validation V-B**:
- `VB-1` unit test: given the real pod output, captured evidence contains the `401` line.
- `VB-2` unit test: given a stack-trace-shaped failure (cause at the end), the cause is also present. Both classes, one implementation.
- `VB-3` live: the next `CronJobNotSucceeding` alert row's `message` contains the causal line. Read it from `monitoring.alerts`, do not infer from code.
- `VB-4` the untruncated evidence is present in `labels` and is machine-readable.

---

### Agent C — one fault, one alert, one surface *(GAP-9, GAP-2)*

**Repo:** `monitoring-microservice`. **Owns:** `src/alerts/error-log-watcher.ts`,
`src/config/failure-surfaces.ts`. **Blocks:** Agent D.

Ordered deliberately: **GAP-9 first**, because fixing normalisation changes how many
surfaces GAP-2 must declare.

**C1 — GAP-9, the signature normaliser.** Four active alert rows exist for
`payments-microservice`, all `ServiceLoggingErrors`, all prefixed `HTTP <n> Error: Not ...`
with different hashes. The normaliser digit-masks but some variance — a URL path, an ID, a
host — survives past the visible prefix. Find what leaks, mask it, and confirm the four
collapse to one. This is a 4× noise multiplier, a triage hazard, and under autonomy it
would open four repair attempts for one problem.

**C2 — GAP-2, the ledger's missing kind.** The `FailureSurfaceKind` union already contains
`k8s-deployment`; **zero entries use it**. All 25 declared surfaces are cronjobs, crontab
entries and timers. So every long-running service is an unregistered surface and blocks
permanently. Note the day-2 assessment attributed this to a missing *type* — that is wrong,
and the correction matters because the fix is smaller than it implied: this is missing
**data**, not a missing type.

**C3 — Set `autoFixEligible` deliberately, per surface.** This flag is now the *only*
containment primitive (D3 removed the human gate; D10 adds a global ceiling but not
per-surface judgement). EP-TASK-006 §D3's recommended default is binding:

> surfaces whose last change was a `fix(security)` commit, and any surface touching auth
> guards, allowlists, RBAC or token issuance, are marked ineligible.

Two independent facts must be reconciled here, and this is Agent C's most consequential
judgement:

- `runlayer`'s coding-agent blacklist already hardcodes `auth-microservice`,
  `payments-microservice`, `database-server` (`coding-worker-agent.service.ts:52-56`).
- `payments-microservice` is currently the **highest-volume** `ServiceLoggingErrors`
  source (4 rows, 126–138 occurrences each).

So the loudest alert source is one the executor will refuse anyway. Marking it
`autoFixEligible: true` would produce goals that runlayer declines — noise with no repair.
**Ledger eligibility must not contradict the executor's blacklist.** Reconcile explicitly
and record the reconciliation; do not let the two lists drift.

**C4 — Do not let the coverage checker regress.** It currently enumerates live CronJobs,
crontab and timers, and is verified not to be a ledger-vs-ledger tautology. Adding
`k8s-deployment` entries means adding a live enumeration source for deployments too —
otherwise the new kind is declared but unchecked, which is precisely the drift the ledger
exists to prevent.

**Validation V-C**:
- `VC-1` the four `payments-microservice` rows collapse to one active alert. Measured in `monitoring.alerts`, not asserted from code.
- `VC-2` `check-failure-surface-coverage.sh` exits 0 and reports `k8s-deployment` in sync against a **live** deployment enumeration.
- `VC-3` no ledger surface is `autoFixEligible: true` while also on runlayer's blacklist. Assert in a test, not by inspection.
- `VC-4` `RepairGate` produces at least one **non-blocked** decision on a real alert. This is the first `allow` in the system's history and is the gate's true exit test.
- `VC-5` daily Telegram volume re-measured after C1 and C2 land, compared against the 33–51/day post-fix floor (D11).

---

## 4. Wave 2 — autonomy and delivery

### Agent D — the execution backend *(GAP-1, GAP-5, D10)*

**Repo:** `monitoring-microservice`. **Owns:** `src/repair/**`, `src/k8s/kube-client.ts`,
`k8s/configmap.yaml`. **Depends on:** B and C merged. **Blocks:** Wave 3.

This is the largest piece and the only one that can change production state. Build it in
the order below; each step is independently testable in shadow.

**D1-step — Machine identity for the runlayer call.** `POST /projects/:projectId/goals` is
behind `JwtGuard` (`goals.controller.ts:10,42`). Monitoring needs a machine identity per
[`SERVICE_IDENTITY_CONSUMER_STANDARD.md`](../../../auth-microservice/docs/SERVICE_IDENTITY_CONSUMER_STANDARD.md)
— the canonical standard, which the ecosystem memory records that 14 services currently
violate with static-token guards. **Do not add a fifteenth.** Also required: which
`projectId` receives these goals, and the dedup key semantics
(`fingerprint`, per §5b) composed with runlayer's `LOOPING_GOAL_CYCLE_LIMIT`. EP-TASK-006
flags that these two dedup mechanisms have never been composed and to budget it as real
work.

**D2-step — The verify loop, V1–V4.** Specified in EP-TASK-006 §5b; implement as written.
Three constraints carry extra weight and must not be softened:

- **V3 fails closed when it cannot observe.** If the target service has no working log
  ingest, verification is **failed**, not passed. Eight services currently ship no logs at
  all. Without this, a silent sender makes every autonomous fix look successful. EP-TASK-006
  calls this the most dangerous interaction in the design.
- **V3 for CronJob surfaces waits for a real scheduled run** (D9). Up to 30 min for the
  trigger case, 24h for daily jobs. The goal stays open; success is **not** declared at
  deploy time. No `create` on `batch/jobs` — the read-only grant is preserved.
- **V4 blast-radius check**: no new alert fingerprints during the verification window. With
  no reviewer, a change that fixes S and breaks T is otherwise indistinguishable from
  success.

**D3-step — Revert is the failure path, not retry.** Any V-failure reverts the commit,
redeploys last-known-good, re-fires at `critical`, and marks the surface ineligible for N
hours. Deploys go through the existing queue and `shared/scripts/deploy.sh`; the loop never
bypasses the lock.

**D4-step — D10 controls.** A global ceiling on autonomous commits per rolling window
across *all* surfaces, and **any revert disables autonomy globally** until a human
re-enables. Both are configuration, both default to the safe value, and the disable must
survive a pod restart — a control that resets on restart is not a control.

**D5-step — GAP-5, the out-of-process dead-man's switch** *(gates autonomy per D8)*. Every
watcher, the heartbeat checker, and `HealthWatcher`'s self-coverage all run inside the one
monitoring pod. Under autonomy a pod death mid-loop can land *after a commit and before
verify/revert*. The host crontab already runs `poll-systemd-timers.sh` every 5 minutes and
reports to monitoring; invert one check so the **host** notices the pod going quiet. No new
application, no privilege — consistent with the existing `run-and-report.sh` pattern.

**D6-step — GAP-8, declare `REPAIR_MODE` explicitly.** Currently empty in the ConfigMap, so
shadow is in force by fallback rather than declaration. An unset variable governing whether
a system may modify production is a legibility risk even when the default is safe.

**Validation V-D** — all must pass in **shadow** before Wave 3:
- `VD-1` a synthetic eligible failure produces exactly one goal, with the dedup key holding across repeated sweeps.
- `VD-2` V3 against a service with broken log ingest reports **verification-failed**. Test explicitly — this is the dangerous path.
- `VD-3` a deliberately bad fix triggers revert, re-fire at `critical`, and the surface is marked ineligible.
- `VD-4` the global ceiling blocks the N+1th commit in a window; a revert disables autonomy globally; **both survive a pod restart**.
- `VD-5` the host-side dead-man's switch fires when the monitoring pod is deliberately stopped. Verify by actually stopping it.
- `VD-6` an ineligible surface produces alert + goal and **no commit**.
- `VD-7` every autonomous action is announced to Telegram — goal opened, commit, verification result, revert. Autonomy without narration reproduces the original defect one level up.

---

### Agent E — delivery and hygiene *(GAP-6, GAP-7)*

**Repo:** `notifications-microservice` primarily. **Depends on:** nothing.
**Parallel with:** D.

**E1 — GAP-6, escalations are lost.** Root cause established from the `error` column:
`getaddrinfo EAI_AGAIN api.telegram.org` — transient DNS, not the idempotency dedupe the
day-2 assessment suspected. Two escalations failed (19:10, 19:40 on 09-05), both
`DeployFailed`, both permanently lost. `repair.service.ts:222-225` catches and logs without
retry; `notifications-microservice` has neither retry nor DLQ.

This is ecosystem-wide, not monitoring-local — **the fix belongs in
`notifications-microservice`** so every caller benefits. Bounded retry with backoff for
transient network classes, and a dead-letter path so an undeliverable alert is visible
rather than gone. Note the existing correct behaviour to preserve: the code logs loudly
rather than swallowing, which is the only reason this was findable.

Under D6 this stops being cosmetic: with autonomy live, a lost escalation is a lost record
of an autonomous action.

**E2 — GAP-7, the self-referential alert.** `monitoring-microservice` alerts on its own
error logs (`errorlog:monitoring-microservice/cronjob_not_succeeding`, 134 occurrences) —
the service alerting about its own alerting activity. Harmless today, a feedback path under
autonomy. Exclude explicitly or acknowledge deliberately; do not leave it ambiguous.

**Validation V-E**:
- `VE-1` a simulated transient DNS failure results in eventual delivery, not loss.
- `VE-2` a permanently undeliverable message lands somewhere visible and countable.
- `VE-3` `monitoring.alerts` no longer accumulates self-referential `errorlog:monitoring-microservice/*` rows for its own alerting activity.
- `VE-4` no regression in the plain-text fallback or 4096-char truncation — both are deliberate anti-loss behaviours.

---

## 5. Wave 3 — enabling autonomy *(not an agent)*

A single serialized step, **triggered by a human**, never by an agent.

**Preconditions — every one, verified by measurement:**

| # | Gate |
| --- | --- |
| 1 | V-A green — the trigger incident is fixed and its alert self-resolved |
| 2 | V-B green — alerts demonstrably carry the cause |
| 3 | V-C green — one fault is one alert; the gate has produced a real `allow` |
| 4 | V-D green — **all seven**, including revert, fail-closed V3, and the restart-surviving global disable |
| 5 | V-E green — escalations survive transient failure |
| 6 | The host-side dead-man's switch is live (D8) |
| 7 | Telegram volume re-measured against the 33–51/day floor (D11) |
| 8 | Standing unacknowledged alerts triaged — see §7 |

**The step:** set `REPAIR_MODE=active` explicitly in the ConfigMap. Deploy. Watch one full
cycle end to end on one eligible surface before walking away.

**Rollback:** set `REPAIR_MODE=shadow`, redeploy. The D10 auto-disable should already have
done this if anything reverted.

---

## 6. Sequencing and parallelism

```
Day 0   ├─ A ──────────────────────────────────────────┐  (deadline 09-11)
        ├─ B ─────────────┐                            │
        └─ C ─────────────┤                            │
                          ▼                            │
Day n                     ├─ D ──────────────┐         │
                          └─ E ──────────────┤         │
                                             ▼         ▼
Day m                              Wave 3 (human-triggered)
```

- **A is on the critical path by calendar, not by dependency.** It blocks nothing
  technically, but it has a fixed date. Start it first and do not let it slip behind
  platform work.
- **B and C are the real critical path** to autonomy. Both are small and independent.
- **D cannot start until B and C are merged.** Not a scheduling preference: D's verify loop
  reads the evidence B produces and the eligibility C declares.
- **E is parallel throughout.** Different repo.

**Concurrency protocol.** Every agent announces file ownership before its first edit and
re-checks with `ListAgents` before touching anything outside its column. Deploys are
serialized by the existing lock; agents stop at the deploy boundary per `AGENTS.md` unless
the deploy is the step being validated. Note Copilot runs over SSH and never appears in
`ListAgents`, so `AGENTS.md` "Concurrent agent sessions" governs, not `ListAgents` alone.

---

## 7. Not delegated to agents

**Triage the standing alerts.** Ten active, all unacknowledged, none acknowledged
overnight. `acknowledgedBy/acknowledgedAt` exist on every row and are null everywhere. This
is not an agent task — detection has outrun absorption, and agents add throughput to the
side that is already ahead. Some of these are real problems nobody has looked at
(`flipflop-product-service` at 141 occurrences, `payments-microservice` at 138).

It is listed as a Wave 3 precondition because enabling autonomy against a backlog nobody
reads reproduces the original failure mode at a higher level: things happening that nobody
knows about.

**The A1 allowlist decision** (§3, Agent A) needs a human sign-off on the specific roles
granted. It is the one deliberate human gate in this plan.

---

## 8. Risks

| Risk | Mitigation | Residual |
| --- | --- | --- |
| Autonomy's first real action is also its first untested one | Every V-D check runs in shadow first; Wave 3 watches one full cycle | The first *eligible production* fix is still a first |
| Outcome gate cannot catch a wrong-but-passing fix (§D3) | `autoFixEligible: false` on all security surfaces; C3 reconciles with runlayer's blacklist | Accepted by owner in D3, restated here |
| Ledger eligibility drifts from runlayer's blacklist | VC-3 asserts non-contradiction in a test | Two lists still live in two repos |
| Deploy queue under machine-generated commits is untested | D10 global ceiling; revert-not-retry | Contention behaviour still unmeasured |
| Pod dies mid-loop after commit, before verify | D5-step dead-man's switch (D8) | Detection, not prevention |
| Volume stays high after C1/C2 | D11 re-measure; D2 reopenable if evidence demands | Owner declined routing for now |
| B fixes truncation but the cause is in neither end | VB-1/VB-2 test both classes against real fixtures | A third failure shape may exist |

---

## 9. Open questions for reviewing agents

1. Which `projectId` should receive autonomously-created runlayer goals, and does it need to exist first?
2. What is the correct global ceiling value in D10? Proposed 3 commits/hour, unmeasured.
3. Should `k8s-deployment` surfaces enumerate from the cluster or from `ecosystem-services.ts` (~60 entries)? The two will disagree, and the disagreement is itself a coverage finding.
4. `LOOPING_GOAL_CYCLE_LIMIT` and monitoring's fingerprint dedup have never been composed. Which wins on conflict?
5. Is 24h an acceptable V3 window for daily CronJobs (D9), or does the goal need an interim state so it does not look stalled?
6. GAP-5's dead-man's switch detects a dead pod. Does anything detect a *wedged* pod — alive, heartbeating, not progressing?
7. What is missing from this plan entirely?

---

## 10. Evidence index

All facts cited here are measured in
[`2026-09-06-silent-failure-day3-verification.md`](../09_assessments/2026-09-06-silent-failure-day3-verification.md)
§8, plus two integration seams verified while drafting this plan:

- `runlayer/src/goals/goals.controller.ts:10,42` — `POST /projects/:projectId/goals` is `@UseGuards(JwtGuard)`; monitoring needs a machine identity
- `runlayer/src/coding-worker/coding-worker-agent.service.ts:52-56,69-73` — blacklist hardcodes `auth-microservice`, `payments-microservice`, `database-server`; throws before dispatch
- `kubectl get pods -n statex-apps -l app=runlayer` — `1/1 Running`, the integration target is live
