import axios from 'axios';

/** Browser uses same-origin /api (Traefik ingress). Server-side may use internal URL. */
function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return '';
  }
  return process.env.MONITORING_API_URL || 'http://localhost:3395';
}

export const api = {
  getServices: () => axios.get(`${getApiBaseUrl()}/api/services`).then(r => r.data),
  getAlerts: (status?: string) =>
    axios.get(`${getApiBaseUrl()}/api/alerts`, { params: { status } }).then(r => r.data),
  acknowledgeAlert: (id: string, acknowledgedBy: string) =>
    axios.post(`${getApiBaseUrl()}/api/alerts/${id}/acknowledge`, { acknowledgedBy }).then(r => r.data),
};
