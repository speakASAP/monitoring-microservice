# Credential Self-Report Contract

Date: 2026-09-02
Status: Phase 1 receiver shipped; Task D (`expiresAt`) added 2026-09-02;
consumer adoption outstanding
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
| `expiresAt` | ISO-8601 string | no | The `exp` of the token the reporter presented. See below. |

**There is no token field, and there must never be one.** The verdict travels;
the credential does not.

### `expiresAt` — reporting your own expiry

Auth cannot supply expiry for anything. It stores principals, not issued tokens,
and every service role grant has `expiresAt IS NULL`. The reporter already holds
its token, so decoding one claim from a JWT it possesses is the only place the
expiry horizon can come from — and what it reports is the credential *genuinely
deployed*, not one that was issued at some point.

Decode the payload; do not verify the signature. The receiver's verdict is what
establishes validity, and a reporter that verified its own token would be
grading its own homework:

```js
const [, payload] = token.split('.');
const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
const expiresAt = exp ? new Date(exp * 1000).toISOString() : undefined;
```

Omit the field if the token carries no `exp` or cannot be parsed. **Never send a
guess.** An absent expiry reconciles as "not reported"; a fabricated one is
worse than nothing, because Phase 2 is allowed to alert on it.

**`expiresAt` is secondary to `verdict`, always.** 2026-08-18 is the proof: 41
tokens carried far-future `exp` values and none of them verified after auth
retired HS256. An expiry check would have called every one healthy. So the
receiver adds `expiringSoon` as a separate annotation on the row and never lets
it modify the status — a `rejected` credential with 80 days left stays
`rejected`.

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
3. Decode `exp` from its own token and include it as `expiresAt`, if present.
4. POST the verdict here.

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

Each row also carries expiry, when the reporter sent one:

| Field | Meaning |
|---|---|
| `expiresAt` | The reported expiry, normalised to ISO-8601. Absent if none was reported or it did not parse. |
| `daysUntilExpiry` | Whole days remaining; negative once already expired. |
| `expiringSoon` | Within `CREDENTIAL_EXPIRY_HORIZON_DAYS` (default 14), or past it. |

`expiringSoon` is **not** a sixth status. It sits alongside the status, because a
credential can be both `rejected` and expiring, and both facts matter. It is
`false` whenever no expiry was reported — an absent field is not an imminent one,
and defaulting it true would make Phase 2 alert on every reporter that has not
yet adopted the field.

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
| `CREDENTIAL_EXPIRY_HORIZON_DAYS` | `14` | Days remaining at which a reported expiry is flagged. |
| `AUTH_INTERNAL_URL` | in-cluster auth DNS | Inventory source. |

## Adoption status

No consumer reports yet, so every principal currently reconciles as `silent`.
That is the correct reading of the current state: nothing is checking these
credentials. Each consumer repo adopting the four steps above moves its own
principal off `silent`.

Principals needing a reporter are every row of `GET /internal/service-principals`
— **43 active** as of 2026-09-02, of which 18 do not follow the
`svc-<caller>--<target>@internal.alfares.cz` address convention, and 14 have an
address naming a service their role grants do not match.

On those 14: the mismatch is expected for most of them and is not a defect to
fix before writing a reporter. Ten hold a role scoped to the *caller* rather than
the target, so the flag is a false positive by construction. A reporter should
send the `target` it actually calls, which is what makes the address's claim
irrelevant. See the plan's Task C.

Seven duplicate groups covering 15 principals are still unclassified (plan Task
B), and the auth DB has no liveness signal to classify them with. **Reporter
adoption is what will resolve them**: a principal whose consumer reports is live
by demonstration, and one still `silent` after full adoption is the retirement
candidate. Task B therefore follows Task A rather than preceding it.
