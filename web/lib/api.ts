import axios from 'axios';

const API_URL = process.env.MONITORING_API_URL || 'http://localhost:3395';

export const api = {
  getServices: () => axios.get(`${API_URL}/api/services`).then(r => r.data),
  getAlerts: (status?: string) => axios.get(`${API_URL}/api/alerts`, { params: { status } }).then(r => r.data),
  acknowledgeAlert: (id: string, acknowledgedBy: string) =>
    axios.post(`${API_URL}/api/alerts/${id}/acknowledge`, { acknowledgedBy }).then(r => r.data),
};
