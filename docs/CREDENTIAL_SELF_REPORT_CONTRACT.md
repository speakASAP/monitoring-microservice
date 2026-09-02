# Credential Self-Report Contract

Date: 2026-09-02
Status: Phase 1 receiver shipped; consumer adoption outstanding
Plan: `auth-microservice/docs/SERVICE_CREDENTIAL_PROBER_PLAN.md`

## Why consumers report instead of being probed

The plan assumed a central prober that probes each credential. That requires the
prober to hold every credential it checks, which would make
monitoring-microservice able to impersonate every service in the ecosystem — a
worse exposure than the failures being prevented. Auth also cannot supply the
tokens: it stores principals, not issued JWTs, which live in Vault and sync into
each consumer's own secret.

So the direction is reversed. Each service probes its own credential with the
token it already holds and posts the verdict. No secret ever leaves its owner,
and the verdict describes the credential that is genuinely deployed.

The cost is that **silence is now the primary signal**. A broken credential
usually stops reporting rather than reporting a failure, so a principal that
never reports is a finding in its own right, not a blank row.

## Endpoint

```
POST /api/credentials/report
Authorization: Bearer <the caller's existing static service token>
Content-Type: application/json
```

Gated by `MonitoringIngestGuard` — the same static-token gate the deploy queue
uses. No new credential is minted for reporting.

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `principal` | string | yes | The principal the reporter authenticated as, exactly as it appears in auth (e.g. `svc-monitoring--logging@internal.alfares.cz`). |
| `target` | string | yes | The service that accepted or rejected it. |
| `verdict` | `accepted` \| `rejected` \| `indeterminate` | yes | See classification below. |
| `detail` | string | no | Max 500 chars. |
| `status` | int | no | The HTTP status the receiver returned. |

**There is no token field, and there must never be one.** The verdict travels;
the credential does not.

### Classification

Reporters must classify their own probe exactly as follows. Collapsing the third
case into the second is what makes a prober noisy enough to be muted.

| Receiver response | `verdict` |
|---|---|
| `2xx` | `accepted` |
| `401` / `403` | `rejected` |
| anything else, timeout, DNS, connection refused | `indeterminate` |

An unreachable receiver is a *health* problem that `HealthWatcher` already owns.
Reporting it as `rejected` would double-report one incident and train the channel
to ignore both.

## What a reporter must do

1. On a schedule (30 minutes matches the watcher's default cadence), call a
   **read-only** endpoint on the service it authenticates to, using its real
   deployed credential.
2. Classify the response per the table above.
3. POST the verdict here.

Probe a read-only endpoint and never infer liveness from a write. Where no safe
read exists, do not invent a call — skip reporting and say so in the repo's
notes, so the principal shows as `silent` rather than falsely `accepted`.

## Reconciliation

`CredentialWatcher` pulls the principal inventory from
`auth-microservice: GET /internal/service-principals` and reconciles it against
received verdicts:

| Status | Meaning |
|---|---|
| `accepted` / `rejected` / `indeterminate` | As reported, within TTL. |
| `stale` | Last report older than `CREDENTIAL_REPORT_TTL_MINUTES` (default 120). |
| `silent` | Principal exists in auth and has never reported. |

Read the matrix at `GET /api/credentials` (admin-gated).

Phase 1 fires no alerts. It establishes the baseline first; wiring alerts before
knowing the real rate of silence and rejection is how a channel gets muted on day
one.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `CREDENTIAL_WATCH_CRON` | `*/30 * * * *` | Reconciliation cadence. |
| `CREDENTIAL_WATCH_ENABLED` | unset | `false` disables the sweep. |
| `CREDENTIAL_REPORT_TTL_MINUTES` | `120` | Age at which a report becomes `stale`. |
| `CREDENTIAL_INVENTORY_TIMEOUT_MS` | `5000` | Inventory fetch timeout. |
| `AUTH_INTERNAL_URL` | in-cluster auth DNS | Inventory source. |

## Adoption status

No consumer reports yet, so every principal currently reconciles as `silent`.
That is the correct reading of the current state: nothing is checking these
credentials. Each consumer repo adopting the three steps above moves its own
principal off `silent`.

Principals needing a reporter are every row of `GET /internal/service-principals`
— 42 active at the time of writing, of which 18 do not follow the
`svc-<caller>--<target>@internal.alfares.cz` address convention, and 14 have an
address naming a service their role grants do not match.
