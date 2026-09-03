

# Tasks: monitoring-microservice

## Active

### Daily digest not delivered since 2026-08-25 - FIXED AND VERIFIED (2026-09-03)

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


Restore daily health digest delivery. The 08:00 UTC job still runs and still writes its
snapshot every day, but no digest has reached Telegram since 2026-08-25 and the failure is
silent: nothing is logged and no notification row is created.


## Ready next

- **OPEN: a second, unexplained digest failure mode.** The dedup fix (see Active) is real and
  verified, but a sweep on 2026-09-03 showed it explains only **3 of the 9** recent missing
  digests - 08-27, 08-29 and 09-01, the days with a null-subject monitoring alert inside the
  5-minute window. On **08-28, 08-30, 08-31, 09-02 and 09-03** the nearest same-shape message
  was 10-30 minutes away, so dedup cannot have been the cause, yet no notification row exists.
  On 09-03 the request provably reached notifications (JwtRolesGuard WARN at 08:00:00) and the
  snapshot was written at 08:00:00.2, so `runDigest()` ran and called out. Something between the
  controller entry and row creation is discarding it without an error.
  Hypotheses NOT yet eliminated: an intermittent 500 on `/notifications/send` (one probe returned
  HTTP 500 on 2026-09-03 and was never explained); an exception inside `send()` before the insert.
  Ruled OUT by measurement: missing token, message length (4140 chars delivered fine, id 2858),
  channel-policy rejection (it throws rather than dropping).
  **Decisive observation is the 08:00 digest on 2026-09-04** - it now runs with the dedup fix and
  the new shape-collision WARN in place. If it is still missing, the second mode is confirmed
  and dedup was never the main cause.


- **Owner decision (blocking): narrow the notifications dedup key.** Root cause of the digest
  outage is `notifications-microservice/src/notifications/notifications.service.ts:139-176`.
  See the Active section for the evidence. The fix changes behaviour for every caller of
  notifications-microservice, so it needs an owner call before implementation.
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
