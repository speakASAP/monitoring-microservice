# Project Constitution

```yaml
id: CONST-001
status: approved
owner: Project Sponsor / Product Owner
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream: []
downstream:
  - ../01_vision/VISION.md
related_adrs:
  - ../07_decisions/ADR-001-use-ips-governance-baseline.md
```

## Purpose

This constitution protects the monitoring-microservice intent: provide reliable operational visibility for the Statex ecosystem through a NestJS API, Next.js dashboard, Kubernetes monitoring stack, and synchronized service registry.

## Constitutional Principles

1. Preserve the observability intent before adding implementation scope.
2. Keep monitored service registry changes traceable from documentation to `src/config/ecosystem-services.ts` and `k8s/prometheus/configmap-config.yaml`.
3. Validate changes before deployment with unit/build checks and IPS gates.
4. Keep production secrets and raw operational data out of prompts, examples, tests, logs, and validation reports.
5. Treat Prometheus restart behavior as an operational invariant: reload config, do not rollout restart Prometheus for config-only changes.

## Immutable Source Of Truth

AI agents may read and reference this constitution, but future changes to this file require human approval through `17_governance/amendments/`.

## Traceability Requirement

Every implementation task must preserve this chain:

```text
Vision -> Goal Impact -> System -> Feature -> Task -> Execution Plan -> Code -> Validation
```

## AI Agent Boundaries

Agents must not invent business goals, approvals, production facts, secret values, customer data, or operational evidence. Missing information must be marked with the standard unknown-information marker only in mutable downstream documents.

## Validation

Constitution compliance is checked through documentation review, protected-file review, and the IPS gates in `scripts/`.
