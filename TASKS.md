

# Tasks: monitoring-microservice

## Active

### Daily digest outage 2026-08-26 -> 2026-09-03 - DELIVERY RESTORED, VERIFIED 2026-09-04

**The bug is in notifications-microservice, not in monitoring-microservice.**

`notifications.service.ts:139-176` suppresses a notification when an earlier row matches
`(channel, recipient, subject, type)` with status SENT/PENDING inside a 5-minute window.
The message body is deliberately excluded from the key ("to catch duplicates even if message
content varies slightly"). On a hit it returns `{status: 'sent', messageId: <the OTHER message's id>}`
with HTTP 201, so the caller cannot tell its notification was dropped.

The digest sends `channel=telegram, recipient=<owner chat>, subject=null, type=custom`.
Every operational alert uses those same four values. Any alert to the owner chat in the five
minutes before 08:00 therefore silently swallows the digest.

Evidence (notifications DB, 07:50-08:06 window):
- Through 08-25 the Monitoring digest and the Orchestrator Morning Digest both sent at 08:00;
  they never collided because the Orchestrator sets a non-null `subject`.
- 08-27 07:58:15 `RESOLVED: kube-state-metrics` (subject null) -> 08:00 digest absent.
- 08-29 07:55:00 `STILL FAILING: orders-microservice` (subject null) -> 08:00 digest absent.
- No Monitoring digest row exists on any date after 08-25.

Reproduced live 2026-09-03 14:36: two probes with different message bodies returned the
identical `id` 05c8bb40-... and Telegram `messageId` 2854. The second was never delivered, yet
was reported as `status: "sent"`.

**Corrections to earlier notes below** (both were measurement errors, not facts):
- `NOTIFICATION_SERVICE_TOKEN` IS set in the monitoring pod. The earlier "unset" claim came from
  a grep pattern that only matched the plural `NOTIFICATIONS_*` prefix.
- The absent `NotificationsController` log line at 08:00 proved nothing: a *successful* probe
  produced no such line either, because `logger.log` is below the pod's active log level.

**FIXED** in notifications-microservice `b1992cd` (owner approved the content-hash approach).
A duplicate must now also carry identical message content and the same `service`; a shape
collision with differing content is logged as a WARN and delivered.

Verified against the deployed pod (2026-09-03 15:12 UTC, pod `...-6d6cb56c89-nxnpf`):
two messages sharing the digest shape but differing in content produced distinct ids and
distinct Telegram message ids 2856 / 2857, while an identical resend still collapsed onto
its predecessor. Typecheck clean, 17/17 notifications unit tests pass.

Open item: one probe against the *old* pod returned HTTP 500 and was not explained before
that pod was replaced. Not reproduced since the fix. Worth a look if 500s recur.

Superseded proposal, kept for context:
Narrow the dedup key so it means idempotency (an identical retry) rather than "same shape":
add the message body or its hash, plus `service`, to the match, and log a WARN when a
same-key/different-content notification is let through. This affects every caller of
notifications-microservice, so it is not being changed unilaterally.

**Do not** treat a fresh `daily_digest_snapshot` row as proof of delivery: `runDigest()` upserts
the snapshot before calling `sendTelegram`.


Delivery is restored as of 2026-09-04 (messageId 2863). See "RESOLVED by observation" under
Ready next for the two distinct causes behind the 2026-08-26 -> 09-03 gap and for the two
follow-ups that remain open (the swallowed failure in `runDigest()`'s catch, and this service's
absence from the logging index).


## Ready next

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


- **Sweep other `/api/logs` callers for the same payload defect.** The bug fixed here in
  `7d256e2` is not monitoring-specific in nature: any service that spreads context fields across
  the top level of its log payload gets a 400 from `forbidNonWhitelisted` and, if it swallows
  errors the way this one did, loses its structured events without noticing. Worth enumerating
  the callers and checking which ones nest under `metadata`. Cheap to check, and this instance
  cost eleven days of un-diagnosable outage.


- Owner decision, still open and unchanged: choose one implementation or operations lane -
  target inventory reconciliation, alert and health-check noise reduction, dashboard validation,
  or deployment-readiness verification.

## Blocked

The next monitoring *implementation* goal remains blocked on the owner selecting a bounded lane
and target coverage. This is a queue decision and is separate from the digest delivery defect
above, which is a regression in shipped behaviour and needs no lane decision.


## Completed


- 2026-06-21: Added business and task documents to restore agent-document coverage.
- 2026-08-30: Completed canonical IPS documentation adoption for the running monitoring service.
- 2026-09-03: Hardened the digest diff - an empty previous snapshot is treated as a first run
  instead of reporting every service as newly failing, and diff entries are ordered
  deterministically. Full suite 80/80.
- 2026-09-03: Verified the IPS governance baseline end to end and closed its execution plan.


## Handoff


The next worker may update only owner-selected scope after reviewing this file, `STATE.json`,
registry, and Prometheus targets. Production visibility changes require synchronized
configuration review. **Do not treat the digest as healthy because snapshots are present** - the
snapshot is written before the send, so a fresh snapshot row proves only that the job started.
