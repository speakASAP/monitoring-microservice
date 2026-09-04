

# Tasks: monitoring-microservice
## Active

No active task. The daily digest outage is resolved and its plan is closed
(`docs/superpowers/plans/2026-06-09-daily-health-digest.md`, status `done`).

The chosen lane for the next implementation goal is **alert and health-check noise reduction**
(owner decision 2026-09-04, recorded under Completed). Target coverage inside that lane is an
implementation question and needs a goal id before work starts.


## Ready next

- **Sweep other `/api/logs` callers for the same payload defect.** The bug fixed here in
  `7d256e2` is not monitoring-specific in nature: any service that spreads context fields across
  the top level of its log payload gets a 400 from `forbidNonWhitelisted` and, if it swallows
  errors the way this one did, loses its structured events without noticing. Worth enumerating
  the callers and checking which ones nest under `metadata`. Cheap to check, and this instance
  cost eleven days of un-diagnosable outage.


- **Reduce alert and health-check noise (chosen lane, needs a goal id before work starts).**
  The kube-state-metrics flapping storm of 2026-08-26 -> 09-01 drove owner-chat telegram volume
  from ~6 msgs/day to 46/144/71/105/52/104. That noise is what let a nine-day digest outage pass
  unnoticed, so reducing it is a prerequisite for the owner chat being a trustworthy signal.
  Scope is not yet defined; define it and record a goal id in `STATE.json.planning` before
  starting.


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

  1. **No Authorization header.** The client never sent one; `/api/logs` answers
     401 `Logging ingest credential required`. Fixed in `50bd870`; the token was already
     mounted as `LOGGING_SERVICE_TOKEN`.
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
  - *Auth or a missing token* - ruled out. `NOTIFICATION_SERVICE_TOKEN` is set (64 chars) and
    monitoring successfully created 6-142 notification rows through the same endpoint and the
    same token on 08-28, 08-30, 08-31 and 09-03.
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
registry, and Prometheus targets. Production visibility changes require synchronized
configuration review. **Do not treat the digest as healthy because snapshots are present** - the
snapshot is written before the send, so a fresh snapshot row proves only that the job started.
