'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AuthGate } from '../../components/auth/AuthGate';
import { api } from '../../lib/api';
import { clearAuthTokens, getAuthToken } from '../../lib/auth';

type Integration = {
  id: string;
  name: string;
  serviceType: string;
  endpointType: string;
  baseUrl: string;
  healthPath: string;
  webhookPath: string;
  apiKeyPreview: string;
  apiKey?: string;
  ingestEndpoint: string;
  webhookEndpoint: string;
};

function CustomerDashboard() {
  const token = getAuthToken();
  const [items, setItems] = useState<Integration[]>([]);
  const [newKey, setNewKey] = useState<string>('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: 'Checkout API',
    serviceType: 'api',
    endpointType: 'https',
    baseUrl: 'https://checkout.example.invalid',
    healthPath: '/health',
    webhookPath: '/webhooks/monitoring',
    notes: '',
  });

  const load = async () => {
    if (!token) return;
    setItems(await api.getCustomerIntegrations(token));
  };

  useEffect(() => { load().catch(() => setError('Unable to load integrations')); }, [token]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      const created = await api.createCustomerIntegration(token, form);
      setNewKey(created.apiKey || '');
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Unable to create integration');
    }
  };

  const rotate = async (id: string) => {
    const updated = await api.rotateCustomerIntegrationKey(token, id);
    setNewKey(updated.apiKey || '');
    await load();
  };

  const remove = async (id: string) => {
    await api.deleteCustomerIntegration(token, id);
    await load();
  };

  return (
    <main style={{ minHeight: '100vh', background: '#0f172a', color: '#e2e8f0' }}>
      <header style={{ borderBottom: '1px solid #1e293b', padding: '1rem 1.25rem' }}>
        <div style={{ maxWidth: '1180px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
          <div style={{ color: '#3b82f6', fontWeight: 800 }}>AlphaCZ Monitoring</div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <a href="/" style={{ color: '#94a3b8' }}>Landing</a>
            <button onClick={() => { clearAuthTokens(); window.location.assign('/'); }} style={{ background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', borderRadius: '8px', padding: '0.55rem 0.8rem', cursor: 'pointer' }}>Sign out</button>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: '1180px', margin: '0 auto', padding: '2rem 1.25rem', display: 'grid', gridTemplateColumns: 'minmax(280px, 0.8fr) minmax(320px, 1.2fr)', gap: '1.25rem' }}>
        <section>
          <h1 style={{ fontSize: '2.2rem', lineHeight: 1.1, marginBottom: '0.75rem' }}>Customer dashboard</h1>
          <p style={{ color: '#94a3b8', lineHeight: 1.6, marginBottom: '1.25rem' }}>Connect your applications to AlphaCZ Monitoring with service health endpoints, ingest URLs, webhook targets, and API keys.</p>

          <form onSubmit={submit} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '1rem', display: 'grid', gap: '0.75rem' }}>
            {error && <div style={{ color: '#fca5a5', fontSize: '0.9rem' }}>{error}</div>}
            <label style={{ display: 'grid', gap: '0.35rem', color: '#94a3b8', fontSize: '0.85rem' }}>Service name
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} />
            </label>
            <label style={{ display: 'grid', gap: '0.35rem', color: '#94a3b8', fontSize: '0.85rem' }}>Base URL
              <input value={form.baseUrl} onChange={e => setForm({ ...form, baseUrl: e.target.value })} style={inputStyle} />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <label style={{ display: 'grid', gap: '0.35rem', color: '#94a3b8', fontSize: '0.85rem' }}>Type
                <select value={form.serviceType} onChange={e => setForm({ ...form, serviceType: e.target.value })} style={inputStyle}>
                  <option value="api">API</option>
                  <option value="webhook">Webhook</option>
                  <option value="worker">Worker</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: '0.35rem', color: '#94a3b8', fontSize: '0.85rem' }}>Health path
                <input value={form.healthPath} onChange={e => setForm({ ...form, healthPath: e.target.value })} style={inputStyle} />
              </label>
            </div>
            <label style={{ display: 'grid', gap: '0.35rem', color: '#94a3b8', fontSize: '0.85rem' }}>Webhook path
              <input value={form.webhookPath} onChange={e => setForm({ ...form, webhookPath: e.target.value })} style={inputStyle} />
            </label>
            <button style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', padding: '0.8rem 1rem', fontWeight: 800, cursor: 'pointer' }}>Add service</button>
          </form>

          {newKey && (
            <div style={{ marginTop: '1rem', background: '#052e16', border: '1px solid #166534', borderRadius: '10px', padding: '1rem' }}>
              <div style={{ fontWeight: 800, color: '#86efac', marginBottom: '0.4rem' }}>New API key</div>
              <code style={{ display: 'block', overflowWrap: 'anywhere', color: '#dcfce7' }}>{newKey}</code>
            </div>
          )}
        </section>

        <section style={{ display: 'grid', gap: '1rem' }}>
          {items.length === 0 && (
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '1.25rem', color: '#94a3b8' }}>
              No services connected yet.
            </div>
          )}
          {items.map((item) => (
            <div key={item.id} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.75rem' }}>
                <div>
                  <div style={{ fontWeight: 800 }}>{item.name}</div>
                  <div style={{ color: '#64748b', fontSize: '0.85rem' }}>{item.baseUrl}{item.healthPath}</div>
                </div>
                <div style={{ color: '#22c55e', fontWeight: 800, fontSize: '0.85rem' }}>Active</div>
              </div>
              <div style={{ display: 'grid', gap: '0.5rem', color: '#94a3b8', fontSize: '0.86rem' }}>
                <div><strong style={{ color: '#e2e8f0' }}>API key:</strong> {item.apiKeyPreview}</div>
                <div><strong style={{ color: '#e2e8f0' }}>Ingest endpoint:</strong> <code>{item.ingestEndpoint}</code></div>
                <div><strong style={{ color: '#e2e8f0' }}>Webhook endpoint:</strong> <code>{item.webhookEndpoint}</code></div>
              </div>
              <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.9rem', flexWrap: 'wrap' }}>
                <button onClick={() => rotate(item.id)} style={secondaryButton}>Rotate key</button>
                <button onClick={() => remove(item.id)} style={{ ...secondaryButton, color: '#fca5a5' }}>Remove</button>
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#0f172a',
  border: '1px solid #334155',
  color: '#e2e8f0',
  borderRadius: '8px',
  padding: '0.7rem 0.8rem',
  fontSize: '0.95rem',
};

const secondaryButton: React.CSSProperties = {
  background: '#334155',
  border: 'none',
  color: '#e2e8f0',
  borderRadius: '8px',
  padding: '0.55rem 0.75rem',
  cursor: 'pointer',
};

export default function CustomerPage() {
  return (
    <AuthGate>
      {() => <CustomerDashboard />}
    </AuthGate>
  );
}
