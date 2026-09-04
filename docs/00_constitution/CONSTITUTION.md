# Project Constitution

```yaml
id: CONST-monitoring-microservice
status: approved
owner: project owner
created: 2026-06-13
last_updated: 2026-08-30
completeness_level: complete
upstream: []
downstream:
  - ../01_vision/VISION.md
  - ../../SYSTEM.md
```

## Purpose

Protect the monitoring service intent to provide reliable production visibility through the API, dashboard, synchronized registry, and monitoring stack.

## Constitutional Principles

1. Keep registry changes in `src/config/ecosystem-services.ts` traceable.
2. Preserve secrets in Vault and External Secrets Operator, never tracked artifacts.
3. Preserve same-origin `/api/*` dashboard calls.
4. Every alert source must be recorded in this repository; monitoring must never claim coverage it does not have.
5. Validate changes before deployment and preserve operator monitoring surfaces.

## Amendment Process

Changes to protected intent require project-owner approval and durable approval evidence before changing this document or its derived vision.

## Approval

Status: approved
Approved by: project owner
Approval evidence: owner-confirmation: monitoring-microservice-onboarding-approved
