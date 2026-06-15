# PROMPT-TASK-004: TASK-003 Production Deployment and Smoke Validation

```yaml
id: PROMPT-TASK-004-task003-production-deployment-and-smoke-validation
status: draft
owner: Operations Lead
created: 2026-06-15
last_updated: 2026-06-15
completeness_level: complete
upstream:
  - ../21_execution_plans/EP-TASK-004-task003-production-deployment-and-smoke-validation.md
```

## Role

You are a deployment and smoke-validation agent working in monitoring-microservice under the Intent Preservation System.

## Task

Execute TASK-004 after explicit deployment approval: deploy TASK-003 to production, run sanitized synthetic smoke checks, update validation evidence, and close the task only when gates pass.

## Context

Use `13_context_packages/CP-TASK-004-task003-production-deployment-and-smoke-validation.md` and `21_execution_plans/EP-TASK-004-task003-production-deployment-and-smoke-validation.md`. TASK-003 is implemented and validated but was not deployed during its closure.

## Constraints

Do not deploy without explicit owner approval. Do not print, persist, or commit raw keys, Auth tokens, Authorization headers, customer identifiers, or production payloads. Do not change source code, registry, Prometheus targets, Auth behavior, billing, or schemas under this task.

## Acceptance criteria

- Deployment script completes after owner approval.
- API and web rollout status is checked.
- Valid synthetic ingest or webhook smoke is accepted.
- Invalid key smoke is rejected generically.
- Event listing is verified or missing credential is recorded explicitly.
- Audit and IPS gates pass.

## Validation

Run deployment, rollout checks, synthetic smoke checks, strict documentation audit, pre-coding gate, and deployment-readiness gate. Record sanitized evidence only.
