# GOAL-IMPACT-TASK-005: Alert and Health-Check Noise Reduction

```yaml
id: GOAL-IMPACT-TASK-005
artifact_type: task
artifact_id: TASK-005
primary_goal: SYS-001
impact_level: high
impact_description: Makes the owner alert channel trustworthy again by removing repeat and flap traffic, so a real failure is visible on the day it happens rather than lost in volume.
success_metric: Owner-chat telegram volume returns to and stays near its ~6 msgs/day baseline, and a single continuously failing service produces a bounded number of messages per day rather than one per health-check tick.
validation_method: Measured message counts per day in the notifications database, plus live fire/resolve/re-fire verification against the deployed pod.
status: active
```

## Explanation

This lane was chosen by the owner on 2026-09-04 over target inventory reconciliation and
dashboard validation, which were deferred because neither had current evidence of harm.

The evidence here is direct. Between 2026-08-26 and 2026-09-01 owner-chat volume ran at
46/144/71/105/52/104 messages per day against a ~6/day baseline. That noise is what allowed a
nine-day daily-digest outage (2026-08-26 -> 2026-09-03) to pass unnoticed. A channel nobody can
read is not an alerting channel, so reducing the volume is a precondition for every other
monitoring guarantee.

**Attribution corrected 2026-09-04 (`5f6bd8b`).** An earlier version of this document blamed
kube-state-metrics for the sustained volume. That is wrong and the error is worth recording:
`alerts.service` holds the Prometheus *job* label, so it names the scraper, not the affected
workload. Per day, kube-state-metrics drove only 08-26 and 08-27 (918 and 285 alerts, then zero
from 08-28 onward, verified against `monitoring.alerts`). From 08-28 the volume was `STILL
FAILING` repeats at 97-100% of messages - the `HealthWatcher` defect that `284c9b8` fixed. The
Prometheus stack itself (kube-state-metrics, Prometheus, Alertmanager, blackbox-exporter) is
absent from the cluster entirely, confirmed by `kubectl get pods -A`.

## Scope

1. **Flap damping and repeat backoff** - delivered 2026-09-04 (`284c9b8`).
2. **CronJob/Job failure coverage** - not started. This replaces the earlier "fix
   kube-state-metrics" step, which named a target that does not exist. With the Prometheus stack
   gone, `HealthWatcher` polls registered service `/health` endpoints only and there is no Job or
   CronJob failure path at all. The gap is live, not theoretical: `catalog-contract-monitor` has
   been failing since 2026-09-01 with no alert raised.
3. **Owner question, unresolved:** whether the Prometheus stack's removal was intentional. If it
   was, CronJob coverage has to be rebuilt inside this service; if it was not, the stack itself
   needs restoring. The answer changes the shape of step 2, so it is a prerequisite.

## Evidence

- Delivered: flap damping and escalating repeat backoff, commit `284c9b8`, deployed as
  `monitoring-microservice:284c9b8` and verified live (one telegram where the old code sent
  three; deferred recovery delivered exactly once by the sweeper). Note that `284c9b8`'s own
  commit message carries the kube-state-metrics misattribution corrected above; it is recorded
  here rather than rewritten.
- Schema: `scripts/migrate-alert-flap-damping.sql`, applied to production before the deploy.
- Measurements and design traps are recorded in `TASKS.md` under Ready next.

## Validation

Impact is validated when sustained owner-chat volume stays near baseline without suppressing a
genuine state change: a resolve is still delivered exactly once after the flap window, and a
continuously failing service still reports on the escalating backoff rather than falling silent.
