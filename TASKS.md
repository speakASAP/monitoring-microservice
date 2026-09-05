

# Tasks: monitoring-microservice
## Active

**Lane in progress: alert and health-check noise reduction** - `GOAL-IMPACT-TASK-005`
(owner decision 2026-09-04, `docs/22_goal_impact/GOAL-IMPACT-TASK-005.md`).
Its first delivery shipped the same day - flap damping and repeat backoff, `284c9b8`, deployed
and verified live (see Ready next). That delivery addressed the lane's dominant cause; see the
correction note below before acting on the kube-state-metrics framing used earlier.

The daily digest outage that preceded this lane is resolved; its historical implementation plan was removed because it prescribed a superseded machine-authentication flow.

## Ready next

- **DONE 2026-09-04: flap damping and repeat backoff shipped (`284c9b8`, deployed as
  `monitoring-microservice:284c9b8`).** First delivery in the noise-reduction lane. Measured
  cause: owner-chat volume ran at 46/144/71/105/52/104 msgs/day against a ~6/day baseline.
  (Attribution corrected 2026-09-04 - see the correction note below. The commit message of
  `284c9b8` credits kube-state-metrics with 154 of those messages; that holds only for 08-26 and
  08-27. `STILL FAILING` repeats were the dominant ongoing cause.) Two independent defects, both
  fixed:
  1. *No flap damping.* 26 `resolved -> fired` transitions, 22 inside ten minutes (mean 429s),
     each sending a ✅ then a fresh 🚨 for a service whose real state never changed. A resolve now
     only *owes* the ✅; `AlertSweeper` pays it after `ALERT_FLAP_WINDOW_MINUTES` (10) of quiet,
     and a re-fire inside the window reopens the same row silently.
  2. *Repeat on every tick.* `HealthWatcher` runs every 5 min and notified on all of them - the
     300s floor seen between the 72 STILL FAILING messages. `lastNotifiedAt` now drives an
     escalating backoff (15m/30m/1h/2h/4h capped), taking a day-long outage from 288 messages
     to 8.

  Verified live against the deployed pod, not just in tests: fire -> resolve -> re-fire returned
  `notified:true`, then `recoveryDeferred:true`, then `transition:"reopened"` with `flapCount:1`
  on the *same* row id, and produced exactly **one** telegram (messageId 2870) where the old code
  sent three. The deferred recovery was then delivered by the sweeper on a minute tick (messageId
  2871) and its `pendingResolveSince` cleared, confirming exactly-once delivery. Test row deleted
  afterwards; 0 recoveries owed.

  Schema `scripts/migrate-alert-flap-damping.sql` applied to production *before* the deploy
  (`synchronize` is false), backfilling `lastNotifiedAt` across 327,486 rows so the backoff does
  not treat pre-existing alerts as never-notified and restate them all at once.

  Validation: typecheck, lint, build clean; 14 suites / 112 tests pass (66 in `src/alerts`, up
  from 50).

  Two design traps handled explicitly, both worth preserving:
  - Stale expiry must stay silent, so `resolveByFingerprint` takes `{ silent: true }`. Without it
    the sweeper would have turned a 236-row expiry sweep into 236 ✅ messages.
  - `pendingResolveSince` is cleared only after a *confirmed* send, so a failed delivery retries
    next sweep instead of silently losing the recovery.

- **CORRECTION 2026-09-04: the kube-state-metrics framing above was wrong, and the follow-up it
  implied is closed.** Three errors, all now measured rather than inferred:
  1. *The target does not exist.* kube-state-metrics, Prometheus, Alertmanager and
     blackbox-exporter are all absent from the cluster - no pods, no deployments, no namespace,
     and no manifest for any of them anywhere in `k8s-manifests`. All three Prometheus-stack
     alert sources (kube-state-metrics 10,334 alerts, blackbox-http 181, external-secrets 168)
     stopped firing simultaneously on 2026-08-27 between ~16:50 and ~20:39, and 0 of those 10,683
     alerts are still active. There is nothing there to fix or to tune a probe against.
  2. *The alerts were never about kube-state-metrics.* `alerts.service` holds the Prometheus
     **job** label - the scraper, not the affected workload. Identity is `fingerprint`; the
     affected pod appears only in `message`. Reading that column as the subject is what made
     "kube-state-metrics is flapping" look true. The actual subjects were other pods, mostly
     CronJob pods (`domain-research-notification-dispatch-*`, `catalog-contract-monitor-*`,
     `cliplot-readiness-monitor-*`) plus a crashlooping `prometheus-5bd8bf9cff-mx4jc`.
  3. *It was not the dominant cause.* Per-day, kube-state-metrics drove only 08-26 (42) and 08-27
     (141). Volume from 08-28 onward (69/103/48/102) was `STILL FAILING: <service> -
     ServiceUnhealthy (attempt N)` - the `HealthWatcher` repeat-every-tick defect - at 97% of
     messages on 08-28, 100% on 08-29, 73% on 08-31 and 100% on 09-01.

  The practical consequence is that `284c9b8` fixed the lane's real dominant cause rather than a
  secondary one, so no further work is owed against the flapping target.

- **DONE 2026-09-04: the retired Prometheus stack is removed from code, config and docs
  (`3023d84` + `2865e1a`, deployed as `monitoring-microservice:2865e1a`).** Consequence 1 of the
  owner's answer below is now closed; consequence 2 (CronJob coverage) is still open.

  A security fix came out of it. `POST /api/webhooks/alertmanager` was the Alertmanager ingest
  path, had no sender left, and was mounted under the `/api` ingress with no guard: an
  unauthenticated POST from the public internet returned 200 and could create alert rows and
  send Telegram messages to the owner chat. Confirmed reachable before removal and confirmed
  404 after. `src/webhooks` is deleted.

  Also removed: `PROMETHEUS_URL`/`GRAFANA_URL`/`ALERTMANAGER_URL` (nothing read them),
  `GRAFANA_ADMIN_PASSWORD` from the ExternalSecret (verified pruned from the live Secret, which
  ESO does not always do), the `deploy_preflight`/`deploy_post_manifests` hooks that applied
  `k8s/<stack>` trees and POSTed `/-/reload` (both already dead - the trees are gone), and the
  dashboard's `Grafana →` link, which pointed at a host with no ingress.

  Comments that justified live thresholds by Alertmanager's 4h `repeat_interval` were reworded,
  since that rationale no longer holds. **Left deliberately unchanged:** `STALE_ALERT_MINUTES`
  is 360, sized against that 4h interval. Every remaining source re-fires far more often (the
  sweep is every 5 min), so 6h is now very conservative. Shortening it changes when alerts
  silently disappear, so it needs its own measurement rather than a drive-by edit.

  Historical records under `docs/11_*`, `docs/12_*`, `docs/13_*`, `docs/14_*` and `docs/21_*`
  were left untouched on purpose: they record what was true when that work was done.
  `SUB-003-observability-stack.md` is rewritten as a retirement record rather than deleted, so
  the three documents linking to it still resolve.

  Ecosystem-wide cleanup shipped alongside, in `shared`, `backups-microservice` and
  `logging-microservice`. Two of those were stale instructions that could not be followed:
  the hosting-cost plan told the next session to pull 30-day peaks from "Prometheus (already
  running)", and the DR runbook listed Prometheus/Grafana PVCs as an open backup gap, which
  would have sent a responder looking for volumes that do not exist.

- **OPEN, found during that cleanup: ESO sync failures are no longer detected.**
  `shared/scripts/secret-census/README.md` documented detection of ExternalSecrets *failing to
  sync* (Vault unreachable, sealed, bad path, auth expired) as belonging to the Prometheus/ESO
  alert lane. That lane died with the stack on 2026-08-27 - its `external-secrets` alerts (168)
  stopped that day - and nothing replaced it. The secret-census guard does **not** close this:
  it assumes a healthy sync and checks whether the value is right. So a secret that silently
  stops syncing is currently invisible. Flagged in that README. This is the same shape of gap as
  the CronJob one below and probably belongs in the same piece of work.

- **ANSWERED 2026-09-04: the Prometheus stack removal was intentional.** Owner: it is not used
  and is no longer needed. So its absence is not a defect and nothing is to be restored - do not
  propose reinstating Prometheus, Alertmanager, kube-state-metrics or blackbox-exporter.
  Two consequences follow, and only the second is work:
  1. Monitoring must stop presenting infrastructure coverage it no longer has.
  2. The CronJob/Job coverage gap below is now unambiguously this service's to close, since
     nothing else will.

- **Coverage gap this exposed: nothing watches CronJobs.** `HealthWatcher` polls registered
  service `/health` endpoints only; there is no Job or CronJob failure path anywhere in the
  service. While the Prometheus stack existed it covered that implicitly. It no longer does, and
  the gap is not theoretical - `catalog-contract-monitor` has been failing since its last success
  on 2026-09-01 (4 pods in `Error` for schedule `29808704`, exit 1) with no alert raised.
  Its failure is a real one, and out of scope here because the fix belongs to
  `catalog-microservice`: `/api/products/search` returns 401 on both the anonymous and the
  authorized profile. Reproduced directly against `catalog-microservice-69775f8f58-pd4cj:3200` -
  anonymous gives `Missing or invalid Authorization header`; the monitor's `JWT_TOKEN` (HS256,
  valid structure, unexpired - though only until 2026-09-11) gives `Token validation failed`; and
  the internal-service path gives `Unknown internal service name 'catalog-contract-monitor'`.
  The catalog auth hardening of 2026-09-01 (`3fb296a`, `fc2f81c`, `c3614b5`) tightened both
  credential paths without updating this caller.

- **DONE 2026-09-04: swept every `/api/logs` caller in the ecosystem. The payload defect is rare;
  a missing credential is the real epidemic.** 33 repos contain a caller. Verified with
  `logging-microservice/scripts/verify-ecosystem-logging.js` (read-only) plus per-service index
  queries, not by reading source alone.

  All 15 token-holding services checked (`auth`, `payments`, `orders`, `catalog`, `warehouse`,
  `suppliers`, `marketing`, `docs-rag`, `minio`, `backups`, `crypto-ai-agent`, `notifications`,
  `runlayer`, `wisdom-quotes`, `marathon`) log correctly.

  **The payload defect this item was written about was found in only two services**, both fixed:
  `prompts-microservice` (`f4306c8` - `meta` instead of `metadata`, uppercased level, AND no auth
  header: three defects, any one of which was fatal) and `monitoring-microservice` (`7d256e2`).
  `speakasap` was never affected - its senders are `api-gateway` and `notification-service`, which
  already nest under `metadata`; only its unused `verbose` level 400ed, fixed in `bc208fd` there.
  `domain-research` (spreads `...meta`) and `leads-microservice` (sends `meta`) also carry the
  payload defect, but it is moot until they have a credential.

  **Not actioned here, and deliberately so.** Fixing the 11 is a deployment change across 11
  repositories - each needs the `logging-ingest-credentials` secretKeyRef added to its Deployment,
  and note the same live-vs-git drift found in this repo: the reference exists only on live
  objects and in no manifest, so a full apply from git drops it. That is a wider scope than this
  sweep item and touches services this repo does not own. Recorded for the owner to schedule.

  Worth knowing: a bare probe returning 201 does not prove a service logs. Probe with the payload
  shape the service actually sends, and confirm the row comes back out of the index.

## Blocked

Nothing is blocked. The lane decision that previously blocked the next implementation
goal was taken on 2026-09-04 (alert and health-check noise reduction).

## Completed

- 2026-06-21: Added business and task documents to restore agent-document coverage.
- 2026-08-30: Completed canonical IPS documentation adoption for the running monitoring service.
- 2026-09-03: Hardened the digest diff - an empty previous snapshot is treated as a first run
  instead of reporting every service as newly failing, and diff entries are ordered
  deterministically. Full suite 80/80.
- 2026-09-03: Verified the IPS governance baseline end to end and closed its execution plan.

- 2026-09-04: Restored daily digest delivery and closed the 2026-08-26 -> 09-03 outage.
  Delivery itself was fixed by notifications-microservice `b1992cd` (the dedup key now requires
  identical content and `service`, not just the same shape); verified 2026-09-04 08:00:00.789 UTC,
  notifications row `303b798b-5e70-46ba-b206-5af8ce26a859`, Telegram messageId 2863. Three
  further defects found while diagnosing it were fixed here: `e73f64f` escalates a failed digest
  out of band instead of swallowing it, `50bd870` authenticates log ingest, and `7d256e2` nests
  log extras under `metadata` so `forbidNonWhitelisted` stops rejecting every structured event.
  Full post-mortem below.
- 2026-09-04: Owner decision - next implementation lane is alert and health-check noise reduction.
  Target inventory reconciliation and dashboard validation were considered and deferred; neither
  has current evidence of harm.
- 2026-09-04: Owner decision - prove the second loss mode through logging-index coverage only.
  No extra forward instrumentation capturing pod state around each 08:00 run. Satisfied by
  `50bd870` and `7d256e2`.
- 2026-09-04: Owner decision - do not chase the unexplained HTTP 500 against the pre-fix
  notifications pod. Recorded but unpursued; revisit only if 500s recur.

### Post-mortem: daily digest outage 2026-08-26 -> 2026-09-03

- **RESOLVED by observation: the 2026-09-04 digest delivered.** The decisive test this item
  called for has now run. Digest row `303b798b-5e70-46ba-b206-5af8ce26a859` was created 2026-09-04
  08:00:00.789 UTC, status `sent`, Telegram messageId **2863**, against the same pods that
  carried the dedup fix (`notifications-...-nxnpf`, 19h old at the time of check). Delivery is
  restored; the 9-day gap 2026-08-26 -> 2026-09-03 is closed.

  It delivered through the tightest collision in the whole series: the Orchestrator digest was
  written 0.68s earlier (08:00:00.111, messageId 2862) sharing channel/recipient/type. Pre-fix
  that pair survived only because the Orchestrator sets a non-null subject; now content and
  `service` must also match, so it passes on two independent counts.

  **The 9 missing days had two different causes, not one.**

  1. **2026-08-26 - the job never ran.** `monitoring.service_health_snapshots` has rows for every
     date from 08-23 onward *except* 08-26. `runDigest()` upserts the snapshot before sending, so
     a missing snapshot means the `@Cron` never fired. The Orchestrator's 08:00 message is also
     absent that day (it sent normally at 08-25 08:00 and again 08-26 20:00), so this was not a
     monitoring-specific fault. No notification row, no snapshot, nothing to explain downstream.
  2. **The remaining 8 days - `runDigest()` ran and the send produced no row.** Snapshots exist at
     08:00:00.2-08:00:02 on all 8. Of these, dedup explains exactly 3 (08-27, 08-29, 09-01: a
     null-subject monitoring alert inside the preceding 5 minutes). On the other 5 (08-28, 08-30,
     08-31, 09-02, 09-03) the *only* other 08:00 telegram message was the Orchestrator's, which
     carries a non-null subject and therefore could never have matched the dedup key. Dedup is
     ruled out for those 5 by direct query, confirming the 2026-09-03 sweep.

  **Why it was invisible - found and fixed 2026-09-04.** The reason no evidence survived is
  that this service could not write to the log index at all. Two independent defects, both
  hidden by `LoggingService.log()`'s bare `catch { return; }`:

  2. **Extras spread across the top level.** `LogEntryDto` sets `forbidNonWhitelisted`, so any
     unknown top-level key is a 400 `property <x> should not exist`. Every structured call this
     service makes carries extras (`daily_digest_failed` -> `{date, error}`), so even after the
     header fix they were all still rejected. Extras now nest under the DTO's `metadata` field.
     Fixed in `7d256e2`. The DTO was correct and is unchanged.

  Measured inside the pod, authenticated: no extras -> 201, `{probe}` -> 400, `{date}` -> 400.
  After `7d256e2`, a real `daily_digest_failed` event with `{date, error}` was emitted from the
  deployed service and retrieved from the index (2026-09-04T11:15:43Z). That event class is the
  one that was missing for eleven days.

  **What actually broke delivery on the 5 remaining days is still not proven.** The leading
  explanation stays the kube-state-metrics flapping storm that began 2026-08-26 18:30 and drove
  owner-chat telegram volume from ~6 msgs/day to 46/144/71/105/52/104 (back to 5/11/6 on
  09-02..09-04), against the 8s axios timeout in `NotificationsClient`. That remains a
  hypothesis: the logs that would have confirmed it were destroyed by the two defects above,
  and no pod from that window still exists. It is now recoverable rather than invisible - if a
  digest fails again, both the escalation message (`e73f64f`) and a `daily_digest_failed` row
  will say so on the day it happens.

  A digest-shaped send measured from inside the pod today: HTTP 201 in 572ms, well under the 8s
  ceiling under normal load.

  **Measured 2026-09-04, narrowing the second loss mode.** Four candidate mechanisms are now
  ruled out by direct query against the notifications DB:
  - *Slow dedup lookup exceeding the 8s client timeout* - ruled out. `notifications` holds 3,019
    rows in total (2026-05-05 .. 2026-09-04), so the 5-minute window lookup is trivial regardless
    of the single-column-only indexes.
  - *notifications-microservice being unavailable at 08:00* - ruled out. The runlayer Orchestrator
    row was created at 08:00:00.03-08:00:00.20 on all five days.
  - *Channel-policy rejection in `resolveSendPolicy`* - ruled out. The digest sends no
    `channelKey`, so resolution returns `legacy_fallback_no_channel_key` without a DB read or a
    throw.

  **The loss is not digest-specific**, which is the finding that reframes this item. On 08-28,
  08-30, 09-02 and 09-03 monitoring created *zero* notification rows anywhere in 06:30-09:30. On
  08-31 it created its last row at 07:50:22 and its next only after 09:30, on a day that produced
  48 alerts overall. Yet `service_health_snapshots` has a row at 08:00:00.2-08:00:02 every time.
  So `runDigest()` reaches the snapshot upsert and the monitoring process then stops emitting
  outbound notifications entirely across a window spanning the send - a monitoring-side stall or
  death inside `sendTelegram()`, not a notifications-side drop. Consistent with the 512Mi memory
  limit, the 30s-period liveness probe, and how frequently these pods are replaced.

  Per the owner decision above this is left as a supported inference: k8s events no longer retain
  that window and no pod from it survives, so it cannot be proven retrospectively.

- **Owner decision taken 2026-09-04: alert and health-check noise reduction.** The lane is
  chosen and the queue decision is closed. Of the four candidate lanes this is the only one with
  evidence of live harm: the kube-state-metrics flapping storm from 2026-08-26 18:30 drove
  owner-chat telegram volume from ~6 msgs/day to 46/144/71/105/52/104 before returning to 5/11/6
  on 09-02..09-04. That noise is what let a nine-day digest outage pass unnoticed, so reducing it
  is a prerequisite for the owner chat being a trustworthy signal at all. Target inventory
  reconciliation and dashboard validation were considered and deferred: neither has current
  evidence of harm.

- **Owner decision taken 2026-09-04 on proving the second loss mode: logging-index coverage only.**
  Restore this service's presence in the log index, and stop there; do not build the extra
  forward instrumentation that would capture pod state around each 08:00 run. Rationale: delivery
  is restored (messageId 2863 on 09-04) and `e73f64f` now escalates a failed digest out of band,
  so a recurrence announces itself on day one rather than day nine. This decision is already
  satisfied by `50bd870` (missing Authorization header) and `7d256e2` (extras nested under
  `metadata` so `forbidNonWhitelisted` stops rejecting every structured event).

- **Owner decision taken 2026-09-04: do not chase the unexplained HTTP 500.** The single probe
  against the pre-fix notifications pod (see Active, above) stays recorded but unpursued. Revisit
  only if 500s recur.

## Handoff

The next worker may update only owner-selected scope after reviewing this file, `STATE.json`,
and the service registry in `src/config/ecosystem-services.ts`. Production visibility changes
require configuration review. **Do not treat the digest as healthy because snapshots are present** - the
snapshot is written before the send, so a fresh snapshot row proves only that the job started.
