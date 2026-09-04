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
46/144/71/105/52/104 messages per day against a ~6/day baseline, and kube-state-metrics alone
accounted for 154 of them while describing one continuous problem. That noise is what allowed a
nine-day daily-digest outage (2026-08-26 -> 2026-09-03) to pass unnoticed. A channel nobody can
read is not an alerting channel, so reducing the volume is a precondition for every other
monitoring guarantee.

## Scope

1. **Flap damping and repeat backoff** - delivered 2026-09-04 (`284c9b8`).
2. **The flapping target itself** - not started. Damping makes the channel readable but does not
   fix kube-state-metrics, which is what is actually unstable. Determine whether its
   `PodNotReady`/`PodCrashLooping` alerts reflect a real recurring fault or a probe/threshold
   that is too tight.

## Evidence

- Delivered: flap damping and escalating repeat backoff, commit `284c9b8`, deployed as
  `monitoring-microservice:284c9b8` and verified live (one telegram where the old code sent
  three; deferred recovery delivered exactly once by the sweeper).
- Schema: `scripts/migrate-alert-flap-damping.sql`, applied to production before the deploy.
- Measurements and design traps are recorded in `TASKS.md` under Ready next.

## Validation

Impact is validated when sustained owner-chat volume stays near baseline without suppressing a
genuine state change: a resolve is still delivered exactly once after the flap window, and a
continuously failing service still reports on the escalating backoff rather than falling silent.
