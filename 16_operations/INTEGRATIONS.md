# Integrations

```yaml
id: OPS-INTEGRATIONS-001
status: reviewed
owner: Operations Lead
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../04_systems/SYS-001-monitoring-platform.md
downstream: []
related_adrs: []
```

## Runtime Integrations

- PostgreSQL through `DB_*` settings for alerts and service health snapshots.
- Alertmanager webhook at `/api/webhooks/alertmanager`.
- Notifications microservice for alert delivery.
- Logging microservice for operational logs.
- Auth microservice for future dashboard auth.
- Kubernetes monitoring components in namespace `statex-apps`.

## Secret Handling

Secrets come from Vault through ESO and must not be copied into IPS artifacts.
