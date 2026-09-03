

# Tasks: monitoring-microservice

## Active

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
