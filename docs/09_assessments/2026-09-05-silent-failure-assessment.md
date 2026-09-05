# Silent-failure assessment (day 2): verification, new evidence, and decision inputs

- **Date:** 2026-09-05
- **Type:** Research / assessment only. **No code, config, or cluster state was changed.**
- **Status:** DRAFT — for multi-agent review before any planning or implementation.
- **Relationship to prior work:** This document **extends, does not replace**,
  [`2026-09-04-silent-failure-assessment.md`](2026-09-04-silent-failure-assessment.md).
  That document established the gap, the inventory and the option space. This one
  re-verifies it 24 hours later, converts three of its inferences into measured facts,
  adds four findings it did not contain, and narrows the open questions accordingly.
  **Read 09-04 first.** Sections here are numbered independently.
- **Scope:** same as 09-04 — why `catalog-contract-monitor` failed with zero alerts, what
  scheduled work exists, what monitoring/logging/notifications can do today, and where an
  alert-and-remediate loop should be built.
- **Requested outcome (owner):** find errors ASAP and address them ASAP; build it on
  `monitoring-microservice` using `logging-microservice`; **no new applications**.

Convention: `[UNKNOWN: ...]` marks a fact not established. `[VERIFY]` marks a claim a
reviewer should re-confirm before using it as a planning premise. `[RESOLVED-0904]` marks
a point the 09-04 document raised as inference and this document has now measured.

---

## 1. Executive summary

**Nothing has changed in 24 hours.** `catalog-contract-monitor` is still failing on every
30-minute schedule, still producing zero alerts, and the fix has not been applied. The
failure is now **100.8 hours old (~200 scheduled runs, ~800 pod executions)**.

Three things this assessment adds that materially affect planning:

1. **The 401 was reproduced directly against the running catalog pod across all four
   credential paths.** The result is not one broken path but **two independently broken
   ones**, plus a confirmation that the service itself is entirely healthy. 09-04 inferred
   the bearer-path break from the token-health README; it is now measured. `[RESOLVED-0904]`

2. **"Zero alerts" is now proven from the alert store, not from absence of observation.**
   `monitoring.alerts` contains **0 job-related alerts for all time**, and only 5 alert
   rows of any kind since 2026-09-01 — none referencing the CronJob. The alert engine is
   demonstrably working (it fired and resolved `ServiceUnhealthy` and `DeployFailed` rows
   in that window). **The engine is not the gap. The source is.** This is the single
   strongest argument for extending rather than building.

3. **Evidence destruction was demonstrated, not just predicted.** Two failed Jobs from
   earlier this week still exist as API objects, but `kubectl logs` on both returns
   `error: timed out waiting for the condition` — their pods are gone. **A Job record
   outlives its own logs.** Any detector that finds a failed Job later cannot recover *why*
   it failed. This converts 09-04's §3.3 from a retention note into a hard design
   constraint: evidence must be captured at detection time, and detection must run inside
   the retention window.

A fourth point is a countdown, not a finding: catalog's `JWT_TOKEN` now has **5.8 days**
left (expires 2026-09-11T07:18:51Z). It is already non-verifiable today (measured, §3.1),
so its expiry changes nothing functionally — but it will convert a fixable
misconfiguration into a credential re-issue on a security surface if left until then.

---

## 2. Authentication reconciliation

The earlier static-credential diagnosis is removed. Scheduled work is an
independent caller and must follow the sole [Service Identity Consumer Standard](https://github.com/speakASAP/auth-microservice/blob/main/docs/SERVICE_IDENTITY_CONSUMER_STANDARD.md).
Runtime code and configuration remain to be reconciled separately.

## 3. New findings

### 3.3 "Zero alerts" proven from the alert store

09-04 asserted zero alerts from the absence of Telegram messages. This assessment queried
`monitoring.alerts` in `db-server-postgres` directly.

Every alert row since 2026-09-01:

| alertname | service | severity | status | n | first | last |
| --- | --- | --- | --- | --- | --- | --- |
| `ServiceUnhealthy` | warehouse-microservice | critical | resolved | 2 | 09-04 09:50 | 09-04 11:55 |
| `DeployFailed` | domain-research | critical | **active** | 1 | 09-05 10:02 | 09-05 10:02 |
| `DeployFailed` | invoices-microservice | critical | resolved | 1 | 09-03 05:52 | — |
| `DeployFailed` | rent-a-box | critical | resolved | 1 | 09-01 04:55 | — |
| `ServiceUnhealthy` | logging-microservice | critical | resolved | 1 | 09-04 11:00 | — |

And, for all time:

```
select count(*) from monitoring.alerts
where alertname ilike '%job%' or service ilike '%contract-monitor%'
   or coalesce(message,'') ilike '%cronjob%';
-->  0
```

Three things follow:

1. **The alert engine is alive and correct.** It fired, deduplicated and resolved five
   alerts across four services in the same window it stayed silent about the CronJob. The
   silence is not a broken notifier, a muted channel or a delivery failure. It is the
   complete absence of a signal source. **This is the empirical basis for "extend, do not
   rebuild."**
2. **No Job/CronJob alert has ever existed** in this store — including before the
   2026-08-27 Prometheus retirement, because that stack alerted through Alertmanager and
   its webhook ingest was removed rather than migrated into this table. So there is no
   historical baseline to restore; this is greenfield coverage.
3. **A live, unacknowledged alert exists right now**: `DeployFailed / domain-research`,
   fired 2026-09-05 10:02, still `active`. `[UNKNOWN: whether anyone has seen it.]` Worth
   a reviewer's attention as an independent open item, and as a data point on whether the
   single Telegram chat is already being under-read (09-04 §7.5).

### 3.4 A Job outlives its own logs — evidence destruction demonstrated

09-04 §3.3 predicted evidence loss from `KEEP_FAILED_MINUTES=120` plus
`failedJobsHistoryLimit: 1`. This assessment attempted to retrieve the logs of two failed
Jobs still visible in `kubectl get jobs`:

```
kubectl -n statex-apps logs job/cliplot-readiness-monitor-29808589   --> error: timed out waiting for the condition
kubectl -n statex-apps logs job/warehouse-reservation-expiry-29797503 --> error: timed out waiting for the condition
```

Both Job objects still exist and still report `Failed 0/1`. Their pods do not. **The
failure record and the failure explanation have different lifetimes**, and the explanation
is the shorter one.

Design constraints this imposes, which a reviewer should treat as non-negotiable:

- A detector must **capture the log tail at detection time** and persist it into the alert
  or into logging-microservice. A message that says "see the pod" is dead on arrival.
- The **poll interval must be well under 120 minutes** if logs are wanted as evidence.
  `catalog-contract-monitor` runs every 30 minutes, so a 15-minute poll would see every
  failure with logs intact; anything above ~2h sees only the corpse.
- `CronJob.status.lastSuccessfulTime` is the **only janitor-proof signal** and is the only
  field that can answer "how long has this been broken?" — which is exactly the question
  that distinguishes the persistent failure from the four transient ones (§4.2). It should
  be the primary detection signal, with pod logs as best-effort enrichment.
- Confirmed: `pod-janitor` env is `KEEP_FAILED_MINUTES=120`, `KEEP_SUCCEEDED_MINUTES=10`.
  It correctly skips pods of still-active Jobs, and holds a reviewed ClusterRole granting
  `batch/jobs: get,list` — the RBAC precedent 09-04 identified.

### 3.5 monitoring-microservice runs with no ServiceAccount at all

`kubectl -n statex-apps get deploy monitoring-microservice -o
jsonpath='{.spec.template.spec.serviceAccountName}'` returns **empty** — the deployment
uses the namespace `default` ServiceAccount, and no `ServiceAccount`, `Role`, `ClusterRole`
or binding exists in its `k8s/` directory.

This sharpens 09-04 §7.1 option A. Granting monitoring cluster read access is not a matter
of extending an existing narrow role; it means **introducing an identity and a
cluster-scoped RBAC surface to a service that currently has none**, and which is
internet-exposed via `monitoring.alfares.cz` (Traefik ingress confirmed live). That is a
real, reviewable security decision, not a configuration detail. `pod-janitor` is a fair
precedent for the *permissions*, but it is a no-ingress, no-API CronJob — a poor precedent
for the *exposure*. `[VERIFY]` with the owner whether a public-ingress service may hold
cluster read.

### 3.6 The ecosystem map advertises observability that does not exist

`shared/ECOSYSTEM_MAP.md` states: *"monitoring-microservice ... Observability platform
(API + dashboard); **Grafana at grafana.alfares.cz**."*

Measured today:

- `kubectl get pods -A | grep -Ei 'grafana|prom|alertmanager|kube-state'` → nothing.
- `docker ps` → 8 containers, none of them Grafana or Prometheus.
- `kubectl get ingress -A` → no `grafana.alfares.cz`; the only monitoring ingress is
  `monitoring-microservice → monitoring.alfares.cz`.

The Grafana reference is stale — presumably residue of the deliberate 2026-08-27 retirement
(`3023d84`, `2865e1a`, `087d08c`) that was not propagated to the map. This matters beyond
tidiness: **the map is read order #2 in `AGENTS.md`**, so a reviewing agent (or a future
incident responder) can reasonably conclude that dashboards and metric-based alerting exist
and that this gap is already covered. Correcting the map is a documentation fix outside
this assessment's scope, but it should be logged as a finding because it actively
misinforms the exact audience this report is written for.

### 3.7 The deploy watcher is healthy — so the silence is genuine

`AGENTS.md` warns: *"Before trusting notification silence, run
`shared/scripts/deploy-queue/queuectl.sh status`."* Measured:

```
Watcher:    enabled (active)
Worker:     idle
Deploy lock: deploy lock: free
Auto-deploy enabled for 41 services.
```

The watcher is up, so notification silence in this incident is **not** an artefact of a
dead deploy queue. It is the absence of a detector. This closes off an alternative
explanation a reviewer would otherwise have to rule out.

---

## 4. Re-verified facts from 09-04 (independently confirmed)

### 4.1 Still no log collector — the constraint on the owner's preferred design

`kubectl get ds -A` returns **`No resources found`** cluster-wide. No Fluent Bit, no
Vector, no Promtail, no Loki. Independently confirmed against
`logging-microservice/docs/07_decisions/coverage-decision.md`, which records the 2026-08-17
decision *not* to deploy a shipper and to keep the opt-in POST model.

Therefore, restating 09-04 §4.2 point 1 because it is the most consequential fact in this
whole area and the one most likely to be skimmed past:

> **CronJob stdout never reaches logging-microservice.** `catalog-contract-monitor` writes
> its JSON verdict to stdout and sets `process.exitCode = 1`
> (`catalog-contract-monitor.js:180-183`). It calls no notifier and posts to no API. A
> log-watching alerter reading logging-microservice **would not have caught this
> incident**, and will not catch the next one.

The owner's instruction — *"implement it on the monitoring-microservice side using
logs-microservice"* — is right about the **owner** (monitoring) but cannot be satisfied
literally for the **source**. Logging can serve error-*content* signals from long-running
services that already POST; it structurally cannot serve job-*outcome* signals. Reviewers
should treat this as the central design tension, not as a detail to be resolved later.

Two further logging constraints confirmed today, both from live evidence:

- **Ingest coverage is still actively broken.** The `logging-microservice` pod log right
  now is flooded with `log_ingest_rejected` / `missing_credential` for `speakasap`, despite
  TASK-LOG-005 being marked complete on 2026-09-04 and the shared logger having been
  patched to send `Authorization`. The fix has not fully propagated. **Absence of error
  logs currently means nothing**, so any alert rule of the form "no errors seen ⇒ healthy"
  is unsound today.
- **No push, no stream, no index.** No WebSocket/SSE/webhook anywhere in `src/`. Queries
  are line-by-line scans of rotated JSON files (`LOG_ROTATION_MAX_SIZE=100m`,
  `MAX_FILES=10`) with no index on `level`, `service` or `timestamp`. Short-interval
  polling for errors across all services is an O(n) full scan per cycle — a capacity
  question, not a footnote. Note also a documentation/reality mismatch worth `[VERIFY]`:
  README claims a PVC (`logging-microservice-logs`) while `SYSTEM.md` states logs are lost
  on pod restart.

### 4.2 CronJob inventory refreshed — one persistent failure, four transient

Measured 2026-09-05 ~12:05 UTC, 11 CronJobs in `statex-apps`:

| CronJob | Schedule | Last success | Age | Owning repo |
| --- | --- | --- | --- | --- |
| `catalog-contract-monitor` | `14,44 * * * *` | 2026-09-01T07:14:15Z | **100.8h — BROKEN** | catalog-microservice |
| `cliplot-readiness-monitor` | `19,49 * * * *` | 2026-09-05T11:49:14Z | 0.2h | cliplot |
| `domain-research-expiry-recheck` | `2-57/5 * * * *` | 2026-09-05T12:02:17Z | 0.0h | domain-research |
| `domain-research-notification-dispatch` | `9-59/15 * * * *` | 2026-09-05T11:54:13Z | 0.2h | domain-research |
| `marketing-order-affinity-allegro-daily` | `23 2 * * *` | 2026-09-05T02:23:20Z | 9.7h | marketing-microservice |
| `marketing-order-affinity-aukro-daily` | `50 14 * * *` | 2026-09-04T12:50:17Z | 23.2h | marketing-microservice |
| `marketing-order-affinity-bazos-daily` | `0 23 * * *` | 2026-09-04T21:00:24Z | 15.0h | marketing-microservice |
| `marketing-order-affinity-central-orders-backfill` | `20 3 * * *` | 2026-09-05T03:20:14Z | 8.7h | marketing-microservice |
| `pod-janitor` | `*/15 * * * *` | 2026-09-05T12:00:20Z | 0.1h | k8s-manifests |
| `speakasap-lesson-record-sync` | `20 2 * * *` | 2026-09-05T02:20:20Z | 9.7h | speakasap |
| `warehouse-reservation-expiry` | `3-58/5 * * * *` | 2026-09-05T12:03:13Z | 0.0h | warehouse-microservice |

Failed Jobs still visible in the API, all of which recovered on a later schedule and none
of which alerted: `cliplot-readiness-monitor-29808589` (26h), `marketing-order-affinity-
aukro-daily-29797250` (8d), `marketing-order-affinity-bazos-daily-29802060` (5d14h),
`marketing-order-affinity-central-orders-backfill-29799560` (7d8h),
`warehouse-reservation-expiry-29797503` (8d).

The **transient-vs-persistent distinction is therefore load-bearing, not theoretical**: a
naive "a Job failed" trigger would have fired at least five times in eight days for
conditions that self-healed, while missing the one condition that did not. A
`lastSuccessfulTime > N × interval` rule fires once, for the right one.

09-04's observation stands and deserves repeating: **five of the eleven CronJobs are
themselves monitors.** The ecosystem's watchdogs are the least-watched workloads it has.

### 4.3 Delivery remains solved; the receiving end may not be

`notifications-microservice` is `1/1 Running`, `POST /notifications/send` works, Telegram
defaults to plain-text parse mode with a plain-text retry (so a log tail containing `<`
cannot silently destroy an alert), truncates at 4096 chars rather than dropping, and has a
5-minute idempotency window keyed on content **and** service — the latter fixed after a
shape-only duplicate key *"hid the daily digest for nine days (2026-08-25 → 2026-09-03)."*

Two cautions for planning:

- The idempotency incident above is a direct precedent for the failure mode a new alert
  stream would risk. Any new sender must produce content that varies per distinct problem.
- Everything still lands in **one owner chat** (`TELEGRAM_CHAT_ID`). The live `active`
  `DeployFailed / domain-research` alert from 10:02 today (§3.3) is weak evidence that the
  channel's signal-to-noise is already marginal. 09-04 §7.5 raised routing as an open
  question; this assessment upgrades it to a **prerequisite** rather than a nicety.
- `webhook-delivery.service.ts` auto-suspends failing webhook subscriptions after
  `maxRetries` and logs *"Suspension alert logged (email/Telegram notification not
  implemented)"* — a stub. A silent-failure assessment should note that this is another
  instance of the same pattern, in a different service. `[VERIFY]` whether it is in scope.

---

## 5. What the evidence now constrains

These are bounded conclusions from measurement, offered as inputs to planning — not a plan.

1. **Extend, do not build.** The alert engine fired 5 correct alerts in the same window it
   stayed silent on ~200 CronJob failures (§3.3). Dedup, flap damping, repeat backoff,
   deferred recovery and stale-expiry all exist and were exercised in production on
   2026-09-04. The work is a **source adapter**, not an alerting system.
2. **Logging cannot be the job-outcome source.** No collector exists, by decision (§4.1).
   Any design that routes job outcomes through logging-microservice must first either
   deploy a shipper (contradicting an ADR) or modify every job to self-report
   (which cannot detect crashes, OOM, image-pull failures, or a job that never started).
3. **`lastSuccessfulTime` should be the primary signal.** It is janitor-proof, it directly
   expresses persistence-vs-transience (§4.2), and it survives the evidence window (§3.4).
   Pod logs are enrichment, obtainable only inside 120 minutes and only sometimes.
4. **Detection cadence has a hard upper bound of ~2 hours** and a practical one of ~15
   minutes if evidence capture matters (§3.4).
5. **Granting monitoring cluster read is a genuine new security surface**, not an
   incremental permission, because the service holds no ServiceAccount today and is
   publicly ingressed (§3.5).
6. **The trigger incident is a counter-example to unattended auto-fix.** The correct remedy
   is a deliberate security-allowlist judgement plus a credential re-issue on an
   admin-capable token (§3.1, §3.2). An agent optimising for "make the 401 go away" would
   reverse a hardening commit. Any remediation design must exclude `fix(security)` surfaces
   or gate them behind human approval.
7. **Channel routing is a prerequisite, not a follow-up** (§4.3).

---

## 6. Open questions — delta on 09-04 §7

09-04's questions stand. This assessment closes two, sharpens three, and adds three.

**Closed by measurement:**

- *"Is the bearer path also broken, or only expiring?"* → **Broken today**, 401 `Token
  validation failed` (§3.1). Two fixes required, not one.
- *"Did the alerting stack fail to deliver, or was there nothing to deliver?"* → **Nothing
  to deliver.** 0 job alerts all time; engine demonstrably functional (§3.3).

**Sharpened:**

- **§7.1 source of truth.** Option A's cost is higher than 09-04 estimated: monitoring has
  no ServiceAccount at all (§3.5). Reviewers should price "introduce cluster identity to a
  public-ingress service" rather than "extend an existing role."
- **§7.2 detection semantics.** §4.2 supplies the empirical answer: 5 transient failures vs
  1 persistent in 8 days. A raw failure trigger has a measured false-positive rate of 5:1
  here. Recommend reviewers evaluate `lastSuccessfulTime > N × interval` against that data.
- **§7.5 channel design.** Upgrade from open question to prerequisite (§4.3).

**New:**

- **Q-A. Should the detector distinguish "job ran and failed" from "job ran, passed, but
  reported a problem"?** `catalog-contract-monitor` conflates them: it exits 1 both when it
  cannot authenticate and when it finds a genuine contract breach. A future fix that makes
  it exit 0-with-findings would become invisible again. `[VERIFY]` whether monitor-class
  CronJobs need a *result* channel distinct from a *run* channel.
- **Q-B. What is the remediation policy for a detector whose own credential is the
  problem?** Roughly half the plausible CronJob failure modes are credential expiry or
  identity rejection — both security surfaces, both excluded from auto-fix by §5.6. If the
  common case is out of scope for automation, what fraction of the owner's "start fixing
  automatically" goal is actually reachable? This should be answered before effort is
  committed.
- **Q-C. Should the ecosystem map be treated as an alerting input?** It currently advertises
  Grafana that does not exist (§3.6). If reviewing agents read it as authoritative, stale
  entries cause exactly the false-assurance this whole assessment is about. `[VERIFY]`
  whether map-vs-cluster drift deserves its own periodic check — it is cheap, and it is the
  same class of defect as `check-ingest-staleness.sh`.

Carried forward unchanged and still important: 09-04 §7.6 — **what watches the watcher?**
An in-cluster job watcher inside monitoring-microservice has no `OnFailure=` equivalent and
`HealthWatcher` does not monitor itself. A dead-man's-switch requirement should be explicit
in any design.

---

## 7. Evidence index

All commands run over `ssh alfares`; repository paths under `/home/ssf/Documents/Github`.
**No writes were performed other than creating this file.** No secret values were printed;
`JWT_TOKEN` was decoded to claims only.

**Cluster state**
- `kubectl get cronjobs -A`, `kubectl get jobs -A`, `kubectl get pods -n statex-apps`
- `kubectl -n statex-apps get cronjob catalog-contract-monitor -o yaml` →
  `lastSuccessfulTime: 2026-09-01T07:14:15Z`, `lastScheduleTime: 2026-09-05T11:44:00Z`
- `kubectl -n statex-apps get cronjob -o json` + node script → per-CronJob success ages (§4.2)
- `kubectl -n statex-apps logs catalog-contract-monitor-29810144-2rz2s --tail=120`
- `kubectl -n statex-apps logs job/cliplot-readiness-monitor-29808589` → `error: timed out
  waiting for the condition` (§3.4)
- `kubectl get ds -A` → `No resources found` (§4.1)
- `kubectl get pods -A | grep -Ei 'grafana|prom|alertmanager|kube-state'` → none;
  `docker ps` → 8 containers, no Grafana/Prometheus; `kubectl get ingress -A` → no
  `grafana.alfares.cz` (§3.6)
- `kubectl -n statex-apps get deploy monitoring-microservice -o
  jsonpath='{...serviceAccountName}'` → empty (§3.5)
- `kubectl -n statex-apps get cronjob pod-janitor -o jsonpath='{...env}'` →
  `KEEP_FAILED_MINUTES=120`, `KEEP_SUCCEEDED_MINUTES=10` (§3.4)
- `kubectl -n statex-apps get cm catalog-microservice-config -o
  jsonpath='{.data.CATALOG_INTERNAL_SERVICE_NAMES}'` → empty (§3.1)

**Live reproduction (§3.1)** — executed with `kubectl -n statex-apps exec
catalog-microservice-7f98d7db86-gz7f9 -- node -e '...'`, four `fetch` calls to
`http://localhost:3200/api/products?page=1&limit=1` with the header sets in the §3.1 table.
Secrets were read from the pod's own environment and never emitted.

**Alert store (§3.3)** — `kubectl -n statex-apps exec db-server-postgres-68b95f6c77-88zvh
-- psql -U dbadmin -d monitoring -c "..."`; two queries, both `SELECT` only.

**Repository**
- `catalog-microservice`: `git log --oneline -15` (HEAD `8928219`),
  `git show --stat 3fb296a`, `git show --stat fc2f81c`
- `catalog-microservice/scripts/catalog-contract-monitor.js` (194 lines, read in full)
- `catalog-microservice/scripts/catalog-smoke.js:1-75, 285-300`
- `catalog-microservice/src/auth/catalog-auth.guard.ts:120-277`
- `k8s-manifests/services/pod-janitor.yaml:1-80`
- `shared/ECOSYSTEM_MAP.md`, `shared/AGENTS.md`, `shared/docs/CONTROL_TERMINAL.md`
- `shared/scripts/deploy-queue/queuectl.sh status` (§3.7)
- `monitoring-microservice/docs/09_assessments/2026-09-04-silent-failure-assessment.md`
  (685 lines, read in full)
- `logging-microservice/docs/07_decisions/coverage-decision.md`,
  `src/logs/logs.controller.ts`, `src/auth/log-ingest.guard.ts`
- `notifications-microservice/src/telegram/telegram.service.ts`,
  `src/notifications/notifications.service.ts:139-160`, `src/auth/jwt-roles.guard.ts`,
  `src/email/webhook-delivery.service.ts`

---

## 8. Reviewer checklist

A reviewing agent should be able to answer these before endorsing any plan:

1. Do you accept that the **alert engine is not the gap** (§3.3), and that the work is a
   source adapter?
2. Do you accept that **logging-microservice cannot serve job outcomes** (§4.1), and if so,
   how do you reconcile that with the owner's stated preference?
3. Which source do you endorse for job outcomes — Kubernetes API (A), self-report (B), or
   host-side guard (C) — **priced with §3.5's finding** that monitoring has no
   ServiceAccount and is publicly ingressed?
4. Do you accept `lastSuccessfulTime > N × interval` as the primary condition, given the
   measured 5:1 transient-to-persistent ratio (§4.2)? What is N?
5. What is the poll interval, and does it satisfy the ~2h evidence-destruction bound and
   the ~15m evidence-capture goal (§3.4)?
6. Is evidence captured at detection time and persisted? Where?
7. Where do these alerts land — the existing single owner chat, or a new route (§4.3)?
8. What is the remediation depth, and does your policy exclude `fix(security)` surfaces
   (§5.6)? Answer Q-B: if credential failures are the common case and they are excluded,
   what remains automatable?
9. What watches the watcher (09-04 §7.6)?
10. Is repairing logging ingestion (§4.1, `speakasap` still rejected today) a prerequisite
    or a parallel lane?
11. Is the `catalog-microservice` fix — **two credential paths, not one** (§3.1) — tracked
    separately from the alerting work, with the role scope of §3.2 explicitly decided?
12. Are the three unrelated open items logged somewhere: the `active` `DeployFailed /
    domain-research` alert (§3.3), the stale Grafana entry in `ECOSYSTEM_MAP.md` (§3.6),
    and the unimplemented webhook-suspension notification (§4.3)?
