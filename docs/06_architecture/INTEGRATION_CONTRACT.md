# Integration Contract

## Purpose

Describe verified ecosystem integrations for the monitoring API, dashboard, and observability stack.

## Capability Decisions

Auth, PostgreSQL, logging, notifications, and documentation retrieval are required. Redis, AI, payments, catalog, orders, warehouse, invoices, object storage, event bus, monitoring-as-a-client, and backups service integration are not implemented or required by current source and configuration.

## Data Ownership

The service owns alert, incident, customer-integration, and health-snapshot records in PostgreSQL schema `monitoring`; monitored services retain ownership of their own business data.

## Authentication and Authorization

`AuthConsumerService` posts bearer tokens to `auth-microservice` `/auth/validate`; monitoring guards enforce authenticated and authorized access. Secrets are injected through Vault and External Secrets Operator.

## Synchronous Dependencies

The API uses PostgreSQL through TypeORM, posts structured logs to `logging-microservice`, sends Telegram messages through `notifications-microservice`, validates tokens against `auth-microservice`, and probes registered health endpoints.

## Asynchronous Dependencies

Alertmanager posts webhooks to `/api/webhooks/alertmanager`. No RabbitMQ or other event-bus client exists in `src/` or package dependencies.

## Degraded Operation

Invalid authentication rejects protected requests. Database failure prevents persistence. Logging delivery failure reduces visibility, while notification failure is logged and rethrown so an alerting outage is visible. No fallback invents health or alert data.

## Validation

Source inspection confirms `src/auth/auth-consumer.service.ts`, `src/common/logging/logging.service.ts`, `src/common/notifications/notifications.client.ts`, TypeORM configuration, and webhook handling; `ips-adoption.json` records all capability contracts and failure modes.
