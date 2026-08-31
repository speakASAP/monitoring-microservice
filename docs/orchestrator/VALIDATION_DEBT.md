# Validation Debt Ledger

## Purpose

Record known out-of-scope validation failures separately from current-task failures.

## Rules

Debt never excuses a failure touching active-task files or acceptance criteria. Entries must identify safe evidence, owner, scope, and an unblock condition; never include secrets or production data.

## Entries

No validation debt is recorded for the canonical documentation-adoption task. The owner-selected next implementation lane is a planning blocker in `STATE.json`, not validation debt.

## Update Format

Record date, command, sanitized failure summary, scope, owner, current-task impact, unblock condition, and safe evidence location for each future debt entry.
