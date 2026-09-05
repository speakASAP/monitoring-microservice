# Credential Acceptance Reporting

Status: active contract

Service-to-service authentication follows the canonical
[Service Identity Consumer Standard](../../auth-microservice/docs/SERVICE_IDENTITY_CONSUMER_STANDARD.md).

## Contract

A reporter proves a credential rotation only by successfully calling a
read-only route on its target with the reporter-to-target, Auth-registered
RS256 bearer JWT. The reporter then sends the resulting accepted, rejected, or
indeterminate verdict to monitoring with a distinct reporter-to-monitoring
principal. Monitoring obtains any Auth principal inventory with its own
monitoring-to-Auth principal. No credential, decoded claim, expiry value, or
self-asserted identity travels in a report.

The reporting route declares and enforces an explicit least-privilege
internal:monitoring-microservice:credential-report role, creates a separate
service actor, and denies and error-logs an undecorated route. The target probe
must be read-only. A 2xx response is accepted; 401 or 403 is rejected; a
network or server failure is indeterminate.

Auth is the only signer. Each pair credential is minted or re-minted solely by
auth-microservice/scripts/provision-service-token.js and is delivered only by
Vault -> ExternalSecret -> Kubernetes Secret -> secretKeyRef. Static tokens,
API-key substitutes, self-signed tokens, and self-asserted service headers are
not valid reporting authentication.
