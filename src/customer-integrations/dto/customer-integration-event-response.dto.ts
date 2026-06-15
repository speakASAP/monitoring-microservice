import { CustomerIntegrationEvent } from '../customer-integration-event.entity';

export function toCustomerIntegrationEventResponse(event: CustomerIntegrationEvent) {
  return {
    id: event.id,
    integrationId: event.integrationId,
    source: event.source,
    eventType: event.eventType,
    eventId: event.eventId,
    status: event.status,
    severity: event.severity,
    message: event.message,
    payloadSummary: event.payloadSummary,
    observedAt: event.observedAt,
    createdAt: event.createdAt,
  };
}
