# Glossary

```yaml
id: GLOSSARY-001
status: reviewed
owner: Operations Lead
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../01_vision/VISION.md
downstream:
  - ./CORE_ENTITIES.md
related_adrs: []
```

## Terms

- Health sweep: The `HealthWatcher` cron that polls registry health endpoints and drives alert fire/resolve.
- Flap window: The quiet period a resolved alert must hold before its recovery is announced.
- Ecosystem registry: The service and repository catalog in `src/config/ecosystem-services.ts`.
- Fingerprint: The stable dedup identity of an alert; one active row per fingerprint.
- Stale expiry: Closing an active alert nothing has re-fired within `STALE_ALERT_MINUTES`.
- Monitoring dashboard: Next.js web application deployed as `monitoring-web`.
- Monitoring API: NestJS API deployed as `monitoring-microservice`.
- Repeat backoff: The escalating delay before a still-failing alert is restated.
- Service health snapshot: Stored health state used by digest workflows.
