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
  getCustomerIntegrations: (token: string) =>
    axios.get(`${getApiBaseUrl()}/api/customer/integrations`, { headers: authHeaders(token) }).then(r => r.data),
  createCustomerIntegration: (token: string, payload: any) =>
    axios.post(`${getApiBaseUrl()}/api/customer/integrations`, payload, { headers: authHeaders(token) }).then(r => r.data),
  rotateCustomerIntegrationKey: (token: string, id: string) =>
    axios.post(`${getApiBaseUrl()}/api/customer/integrations/${id}/rotate-key`, {}, { headers: authHeaders(token) }).then(r => r.data),
  deleteCustomerIntegration: (token: string, id: string) =>
    axios.delete(`${getApiBaseUrl()}/api/customer/integrations/${id}`, { headers: authHeaders(token) }).then(r => r.data),
};
