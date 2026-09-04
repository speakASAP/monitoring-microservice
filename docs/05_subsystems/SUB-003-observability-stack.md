# SUB-003: Observability Stack (RETIRED)

```yaml
id: SUB-003
status: retired
owner: Operations Lead
created: 2026-06-13
last_updated: 2026-09-04
retired: 2026-09-04
completeness_level: complete
upstream:
  - ../04_systems/SYS-001-monitoring-platform.md
downstream: []
related_adrs: []
```

## Status

Retired. This subsystem no longer exists and this document is kept only so the
links pointing at it still resolve.

The stack it described — Prometheus, Alertmanager, Grafana, Loki, blackbox
exporter, node exporter and kube-state-metrics — was removed from the cluster
on 2026-08-27 by owner decision, confirmed 2026-09-04. Nothing replaced it.

Verified at retirement: no pods, deployments, services or ingresses for any of
those components exist in any namespace; no manifest for any of them exists in
`k8s-manifests` or in this repository's `k8s/`; and `grafana.alfares.cz` is not
served. Their last alerts arrived on 2026-08-27 between roughly 16:50 and
20:39, and none of the 10,683 alerts they had produced are still active.

## What this means for monitoring today

`monitoring-microservice` no longer ingests external telemetry. Its alerts come
from exactly two sources, both inside this repository:

- `HealthWatcher` — polls the health endpoints in
  `src/config/ecosystem-services.ts` every five minutes and drives alert
  fire/resolve.
- The deploy queue — raises and resolves alerts against the service it deployed.

The `POST /api/webhooks/alertmanager` ingest endpoint was removed in the same
change. It had no remaining sender and was reachable unauthenticated from the
public internet.

## Known coverage gap

Infrastructure-level signals that the stack used to provide are now uncovered.
In particular nothing watches Kubernetes Jobs or CronJobs: `HealthWatcher`
polls registered HTTP health endpoints only. This is a real gap, not a
theoretical one — `catalog-contract-monitor` began failing on 2026-09-01 and no
alert was raised. Closing it is tracked separately.

## Validation

Validated by the retirement evidence recorded above.
