# Local Workflow

```yaml
id: OPS-LOCAL-001
status: reviewed
owner: Operations Lead
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../00_constitution/CONSTITUTION.md
downstream: []
related_adrs: []
```

## Workflow

1. Read `AGENTS.md`, `SYSTEM.md`, and relevant IPS task docs.
2. Verify task, goal impact, execution plan, and validation plan exist.
3. Run the relevant narrow tests.
4. Run IPS gates for governance or deployment-impacting changes.
5. Deploy only with `./scripts/deploy.sh` when production deployment is explicitly required.

## Commands

```bash
npm run build
npm test
python3 scripts/strict_doc_audit.py --format markdown --fail-on-issues
python3 scripts/pre_coding_gate.py --root .
python3 scripts/deployment_readiness_gate.py --root .
```

## Deployment Rule

Use `./scripts/deploy.sh` for production deployment.
