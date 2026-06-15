import axios from 'axios';

/** Browser uses same-origin /api (Traefik ingress). Server-side may use internal URL. */
function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return '';
  }
  return process.env.MONITORING_API_URL || 'http://localhost:3395';
}

function authHeaders(token?: string) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type CustomerEndpointType = 'https' | 'webhook' | 'api' | 'custom';

export type CustomerIntegrationPayload = {
  name: string;
  serviceType?: string;
  endpointType?: CustomerEndpointType;
  baseUrl: string;
  healthPath?: string;
  webhookPath?: string;
  notes?: string;
};

export type CustomerIntegrationEvent = {
  id: string;
  integrationId: string;
  source: string;
  eventType: string;
  eventId?: string | null;
  status: string;
  severity: string;
  message?: string | null;
  payloadSummary?: Record<string, unknown> | null;
  observedAt?: string | null;
  createdAt?: string;
};

export type CustomerIntegration = {
  id: string;
  name: string;
  serviceType: string;
  endpointType: CustomerEndpointType;
  baseUrl: string;
  healthPath: string;
  webhookPath?: string | null;
  status?: string;
  apiKeyPreview?: string | null;
  apiKey?: string;
  ingestEndpoint?: string;
  webhookEndpoint?: string;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

function sanitizeCustomerIntegration(value: any): CustomerIntegration {
  return {
    id: String(value.id || ''),
    name: String(value.name || ''),
    serviceType: String(value.serviceType || 'custom'),
    endpointType: (value.endpointType || 'https') as CustomerEndpointType,
    baseUrl: String(value.baseUrl || ''),
    healthPath: String(value.healthPath || '/health'),
    webhookPath: value.webhookPath ?? null,
    status: value.status,
    apiKeyPreview: value.apiKeyPreview ?? null,
    apiKey: typeof value.apiKey === 'string' ? value.apiKey : undefined,
    ingestEndpoint: value.ingestEndpoint,
    webhookEndpoint: value.webhookEndpoint,
    notes: value.notes ?? null,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function sanitizeCustomerIntegrationEvent(value: any): CustomerIntegrationEvent {
  return {
    id: String(value.id || ''),
    integrationId: String(value.integrationId || ''),
    source: String(value.source || 'event'),
    eventType: String(value.eventType || 'event'),
    eventId: value.eventId ?? null,
    status: String(value.status || 'unknown'),
    severity: String(value.severity || 'info'),
    message: value.message ?? null,
    payloadSummary: value.payloadSummary ?? null,
    observedAt: value.observedAt ?? null,
    createdAt: value.createdAt,
  };
}

export const api = {
  getSession: (token: string) =>
    axios.get(`${getApiBaseUrl()}/api/auth/session`, { headers: authHeaders(token) }).then(r => r.data),
  getServices: (token?: string) =>
    axios.get(`${getApiBaseUrl()}/api/services`, { headers: authHeaders(token) }).then(r => r.data),
  getAlerts: (status?: string, token?: string) =>
    axios.get(`${getApiBaseUrl()}/api/alerts`, { params: { status }, headers: authHeaders(token) }).then(r => r.data),
  acknowledgeAlert: (id: string, acknowledgedBy: string, token?: string) =>
    axios.post(`${getApiBaseUrl()}/api/alerts/${id}/acknowledge`, { acknowledgedBy }, { headers: authHeaders(token) }).then(r => r.data),
  getMarathonEvents: (windowMinutes = 60, limit = 25, token?: string) =>
    axios.get(`${getApiBaseUrl()}/api/marathon-monitoring/events`, { params: { windowMinutes, limit }, headers: authHeaders(token) }).then(r => r.data),
  getCustomerIntegrations: (token: string): Promise<CustomerIntegration[]> =>
    axios.get(`${getApiBaseUrl()}/api/customer/integrations`, { headers: authHeaders(token) }).then(r => r.data.map(sanitizeCustomerIntegration)),
  getCustomerIntegrationEvents: (token: string, integrationId: string): Promise<CustomerIntegrationEvent[]> =>
    axios.get(`${getApiBaseUrl()}/api/customer/integrations/${integrationId}/events`, { headers: authHeaders(token) }).then(r => r.data.map(sanitizeCustomerIntegrationEvent)),
  createCustomerIntegration: (token: string, payload: CustomerIntegrationPayload): Promise<CustomerIntegration> =>
    axios.post(`${getApiBaseUrl()}/api/customer/integrations`, payload, { headers: authHeaders(token) }).then(r => sanitizeCustomerIntegration(r.data)),
  updateCustomerIntegration: (token: string, id: string, payload: CustomerIntegrationPayload): Promise<CustomerIntegration> =>
    axios.patch(`${getApiBaseUrl()}/api/customer/integrations/${id}`, payload, { headers: authHeaders(token) }).then(r => sanitizeCustomerIntegration(r.data)),
  rotateCustomerIntegrationKey: (token: string, id: string): Promise<CustomerIntegration> =>
    axios.post(`${getApiBaseUrl()}/api/customer/integrations/${id}/rotate-key`, {}, { headers: authHeaders(token) }).then(r => sanitizeCustomerIntegration(r.data)),
  deleteCustomerIntegration: (token: string, id: string) =>
    axios.delete(`${getApiBaseUrl()}/api/customer/integrations/${id}`, { headers: authHeaders(token) }).then(r => r.data),
};
