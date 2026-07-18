# monitoring-microservice

Centralized observability platform for the Statex ecosystem.

This repository follows the company Intent Preservation System documented under the numbered IPS folders. Start with `docs/00_constitution/CONSTITUTION.md`, `docs/01_vision/VISION.md`, `SYSTEM.md`, and `docs/16_operations/LOCAL_WORKFLOW.md` before implementation work.

## Key commands

```bash
npm run build
npm test
python3 scripts/strict_doc_audit.py --format markdown --fail-on-issues
python3 scripts/pre_coding_gate.py --root .
python3 scripts/deployment_readiness_gate.py --root .
```
