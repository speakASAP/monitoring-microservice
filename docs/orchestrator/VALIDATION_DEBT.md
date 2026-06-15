# Validation Debt Ledger

## Purpose

Record known validation failures that are not caused by the current task, so agents can separate existing repo debt from real regressions.

## Rules

- This ledger does not excuse current-task failures.
- Every entry needs an owner, scope, and unblock condition.
- Do not include secrets, tokens, raw production data, customer identifiers, or private evidence.
- If a failure starts affecting the current task, promote it from debt to blocker.

## Entries

| ID | Date | Command | Failure Summary | Scope | Owner | Blocks Current Task? | Unblock Condition | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| VD-001 | YYYY-MM-DD | `[command]` | `[sanitized failure]` | repo-wide / task-specific / external service | `[owner]` | yes/no | `[required fix or approval]` | `[report path or safe excerpt]` |
| VD-002 | 2026-06-15 | `GET /api/customer/integrations/:id/events` with approved Auth token | Authenticated owner-scoped listing smoke requires an approved smoke Auth token; anonymous route protection and DB owner linkage were verified. | task-specific external credential | Operations Lead | no | Provide approved smoke Auth token or test Auth fixture for customer owner validation. | `12_validation/VAL-TASK-004-task003-production-deployment-and-smoke-validation.md` |

## Current-Task Decision Checklist

- Does the failing command touch files changed by this task?
- Does the failure mention this task ID, goal ID, or changed module?
- Is the failure already listed above with `Blocks Current Task? = no`?
- Did the failure exist before this task started?
- Is the validation command required by the current task acceptance criteria?

## Agent Reporting Format

```text
Validation debt check:
- Command:
- Result:
- Matched ledger entry:
- Current-task impact:
- Next action:
```

Next step: Keep entries current whenever validation failures are classified as out of scope.
