# Repository Agent Instructions

## Required Reading

Read `BUSINESS.md`, `SYSTEM.md`, `TASKS.md`, `STATE.json`, the constitution, vision, invariants, and relevant task, plan, and validation artifacts before work.

## Authority

Repository intent and evidence are authoritative locally; reusable adoption standards and validation semantics are owned by `intent-preservation-system`.

## Intent Preservation System

Preserve Vision -> Goal Impact -> System -> Feature -> Task -> Execution Plan -> Code -> Validation. Use `ips-adoption.json` and canonical artifact paths for adoption evidence.

## Safety and Operations

Do not expose secrets or production data. Preserve same-origin dashboard calls, and keep `src/config/ecosystem-services.ts` the single source of truth for which services are monitored.

## Project-Specific Rules

The API is `src/`, dashboard is `web/`, and stack configuration is `k8s/`. Validate with `npm run build`, `npm test`, and relevant IPS gates before production-impacting work.

## Required Final Report

Report changed files, documents created, validation evidence, validation debt, blockers, deviations, and the next concrete action.
