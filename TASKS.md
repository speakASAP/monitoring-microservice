

# Tasks: monitoring-microservice

## Active

### Daily digest not delivered since 2026-08-25 - ROOT CAUSE FOUND (2026-09-03)

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

**Proposed fix - owner decision needed, changes ecosystem-wide semantics.**
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

- **Diagnose why `sendTelegram` neither delivers nor raises.** Evidence gathered 2026-09-03:
  `monitoring.service_health_snapshots` has a row for every day through 2026-09-03 08:00:00 UTC
  (52 services), so `runDigest()` reaches its upsert. The `notifications` database contains 59
  digest messages matching `Monitoring Daily Digest`, first 2026-06-09, **last 2026-08-25 08:00**,
  and none since. In the 3027 pod log lines from 07:59 onward on 2026-09-03 there is no `ERROR`,
  no `WARN` and no `digest` line, so the `catch` in `runDigest()` never fired. Delivery therefore
  resolves successfully while nothing is persisted or sent. Same-process alerting is unaffected -
  `health-watcher` delivered through the identical `NotificationsClient` at 05:52 on 2026-09-03 -
  so the client, the chat id and the notifications service are all reachable. Two leads not yet
  eliminated: `NOTIFICATION_SERVICE_TOKEN` is **unset** in the live pod, so digests post without an
  `Authorization` header; and the digest payload is far larger than an alert, near Telegram's
  4096-character limit. Note 2026-08-26 has no snapshot row at all, so that day's run failed
  earlier than the others and may be where this started.
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
