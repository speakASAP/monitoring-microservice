# Validation Pyramid

```yaml
id: VAL-PYRAMID-001
status: reviewed
owner: Operations Lead
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../01_vision/VISION.md
downstream:
  - ./VAL-TASK-001-ips-governance-baseline.md
related_adrs: []
```

## Levels

1. Documentation validation: strict audit and IPS gates.
2. Unit validation: Jest tests under `src/**/*.spec.ts`.
3. Build validation: NestJS compile through `npm run build`.
4. Deployment validation: `./scripts/deploy.sh` checks in production deployment flow.
5. Operational validation: health, registry, dashboard, and monitoring stack checks.

## Evidence Rules

Validation reports must state command, status, scope, and relevant output summary without secrets or raw production records.
