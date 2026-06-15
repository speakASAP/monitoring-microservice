'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AuthGate } from '../../components/auth/AuthGate';
import {
  api,
  type CustomerEndpointType,
  type CustomerIntegration,
  type CustomerIntegrationEvent,
  type CustomerIntegrationPayload,
} from '../../lib/api';
import { clearAuthTokens, getAuthToken, type AuthSession } from '../../lib/auth';

type FormState = {
  name: string;
  serviceType: string;
  endpointType: CustomerEndpointType;
  baseUrl: string;
  healthPath: string;
  webhookPath: string;
  notes: string;
};

type RevealedKey = {
  value: string;
  integrationName: string;
  action: 'created' | 'rotated';
};

const emptyForm: FormState = {
  name: 'Example Checkout API',
  serviceType: 'api',
  endpointType: 'https',
  baseUrl: 'https://checkout.example.invalid',
  healthPath: '/health',
  webhookPath: '/webhooks/monitoring',
  notes: '',
};

function CustomerDashboard({ session }: { session: AuthSession }) {
  const [token] = useState(() => getAuthToken());
  const [items, setItems] = useState<CustomerIntegration[]>([]);
  const [eventsByIntegration, setEventsByIntegration] = useState<Record<string, CustomerIntegrationEvent[]>>({});
  const [revealedKey, setRevealedKey] = useState<RevealedKey | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [eventsError, setEventsError] = useState('');
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionId, setActionId] = useState('');
  const [form, setForm] = useState<FormState>(emptyForm);

  const editingItem = useMemo(() => items.find((item) => item.id === editingId) || null, [editingId, items]);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setEventsLoading(true);
    setError('');
    setEventsError('');
    try {
      const integrations = await api.getCustomerIntegrations(token);
      setItems(integrations);
      const eventEntries = await Promise.all(integrations.map(async (item) => {
        try {
          return { id: item.id, events: await api.getCustomerIntegrationEvents(token, item.id), failed: false };
        } catch {
          return { id: item.id, events: [], failed: true };
        }
      }));
      setEventsByIntegration(Object.fromEntries(eventEntries.map(({ id, events }) => [id, events])));
      const failedEventLoads = eventEntries.filter((entry) => entry.failed).length;
      if (failedEventLoads > 0) {
        setEventsError('Unable to load recent events for ' + failedEventLoads + ' integration' + (failedEventLoads === 1 ? '' : 's') + '.');
      }
    } catch (err: any) {
      setError(readApiError(err, 'Unable to load integrations'));
      setEventsByIntegration({});
    } finally {
      setLoading(false);
      setEventsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || saving) return;

    setError('');
    setNotice('');
    setSaving(true);

    try {
      const payload = toPayload(form);
      if (editingId) {
        await api.updateCustomerIntegration(token, editingId, payload);
        setNotice('Integration record updated. Existing keys were not changed.');
      } else {
        const created = await api.createCustomerIntegration(token, payload);
        setRevealedKey({ value: created.apiKey || '', integrationName: created.name, action: 'created' });
        setNotice('Integration created. Save the one-time API key before leaving this page.');
      }
      await load();
      resetForm();
    } catch (err: any) {
      setError(readApiError(err, editingId ? 'Unable to update integration' : 'Unable to create integration'));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: CustomerIntegration) => {
    setEditingId(item.id);
    setNotice('');
    setError('');
    setForm({
      name: item.name,
      serviceType: item.serviceType || 'custom',
      endpointType: item.endpointType || 'https',
      baseUrl: item.baseUrl,
      healthPath: item.healthPath || '/health',
      webhookPath: item.webhookPath || '',
      notes: item.notes || '',
    });
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const rotate = async (item: CustomerIntegration) => {
    if (!token) return;
    setError('');
    setNotice('');
    setActionId(`rotate:${item.id}`);
    try {
      const updated = await api.rotateCustomerIntegrationKey(token, item.id);
      setRevealedKey({ value: updated.apiKey || '', integrationName: updated.name, action: 'rotated' });
      setNotice('Key rotated. Existing copies of the previous key should be retired in your service.');
      await load();
    } catch (err: any) {
      setError(readApiError(err, 'Unable to rotate key'));
    } finally {
      setActionId('');
    }
  };

  const remove = async (item: CustomerIntegration) => {
    if (!token) return;
    const confirmed = window.confirm(`Delete ${item.name}? This removes the integration record and its stored key reference.`);
    if (!confirmed) return;

    setError('');
    setNotice('');
    setActionId(`delete:${item.id}`);
    try {
      await api.deleteCustomerIntegration(token, item.id);
      if (editingId === item.id) resetForm();
      setNotice('Integration deleted.');
      await load();
    } catch (err: any) {
      setError(readApiError(err, 'Unable to delete integration'));
    } finally {
      setActionId('');
    }
  };

  const copyKey = async () => {
    if (!revealedKey?.value) return;
    await navigator.clipboard.writeText(revealedKey.value);
    setNotice('One-time key copied.');
  };

  return (
    <main style={styles.shell}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div>
            <a href="/" style={styles.brand}>AlphaCZ Monitoring</a>
            <div style={styles.headerMeta}>Customer integrations</div>
          </div>
          <nav style={styles.nav} aria-label="Customer navigation">
            <a href="/" style={styles.navLink}>Landing</a>
            {session.isAdmin && <a href="/dashboard" style={styles.navLink}>Admin</a>}
            <button onClick={() => { clearAuthTokens(); window.location.assign('/'); }} style={styles.signOutButton}>Sign out</button>
          </nav>
        </div>
      </header>

      <div style={styles.container}>
        <section style={styles.intro}>
          <div style={styles.kicker}>Registered customer workspace</div>
          <h1 style={styles.title}>Connect services without exposing operational data.</h1>
          <p style={styles.lede}>Create owner-scoped integration records, rotate access keys, and review recent accepted events from your connected services.</p>
          <div style={styles.summaryGrid}>
            <Metric label="Integrations" value={String(items.length)} />
            <Metric label="Recent events" value={String(Object.values(eventsByIntegration).reduce((sum, events) => sum + events.length, 0))} />
            <Metric label="Key storage" value="Hashed" />
          </div>
        </section>

        <section style={styles.workspace}>
          <form onSubmit={submit} style={styles.formPanel}>
            <div style={styles.panelHeadingRow}>
              <div>
                <h2 style={styles.panelTitle}>{editingItem ? 'Edit integration' : 'Add integration'}</h2>
                <p style={styles.panelText}>{editingItem ? 'Update endpoint metadata without changing the API key.' : 'Use synthetic placeholders until your own service URL is ready.'}</p>
              </div>
              {editingItem && <button type="button" onClick={resetForm} style={styles.textButton}>Cancel</button>}
            </div>

            {(error || notice) && <div style={error ? styles.errorBox : styles.noticeBox} role="status">{error || notice}</div>}

            <div style={styles.fieldGrid}>
              <label style={styles.label}>Service name
                <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={styles.input} />
              </label>
              <label style={styles.label}>Base URL
                <input required value={form.baseUrl} onChange={e => setForm({ ...form, baseUrl: e.target.value })} style={styles.input} placeholder="https://service.example.invalid" />
              </label>
              <label style={styles.label}>Service type
                <select value={form.serviceType} onChange={e => setForm({ ...form, serviceType: e.target.value })} style={styles.input}>
                  <option value="api">API</option>
                  <option value="webhook">Webhook</option>
                  <option value="worker">Worker</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              <label style={styles.label}>Endpoint mode
                <select value={form.endpointType} onChange={e => setForm({ ...form, endpointType: e.target.value as CustomerEndpointType })} style={styles.input}>
                  <option value="https">HTTPS</option>
                  <option value="api">API</option>
                  <option value="webhook">Webhook</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              <label style={styles.label}>Health path
                <input value={form.healthPath} onChange={e => setForm({ ...form, healthPath: e.target.value })} style={styles.input} />
              </label>
              <label style={styles.label}>Webhook path
                <input value={form.webhookPath} onChange={e => setForm({ ...form, webhookPath: e.target.value })} style={styles.input} />
              </label>
            </div>

            <label style={styles.label}>Notes
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ ...styles.input, minHeight: '86px', resize: 'vertical' }} placeholder="Synthetic setup note or internal runbook pointer" />
            </label>

            <button disabled={saving} style={{ ...styles.primaryButton, opacity: saving ? 0.68 : 1 }}>
              {saving ? 'Saving...' : editingItem ? 'Save changes' : 'Add service'}
            </button>
          </form>

          <section style={styles.listPanel} aria-live="polite">
            <div style={styles.panelHeadingRow}>
              <div>
                <h2 style={styles.panelTitle}>Integration records</h2>
                <p style={styles.panelText}>Records and recent accepted events returned from owner-scoped customer APIs.</p>
              </div>
              <button type="button" onClick={load} disabled={loading || eventsLoading} style={styles.refreshButton}>{loading || eventsLoading ? 'Loading' : 'Refresh'}</button>
            </div>

            {revealedKey && <OneTimeKeyPanel keyDetails={revealedKey} onCopy={copyKey} onDismiss={() => setRevealedKey(null)} />}
            {eventsError && <div style={styles.errorBox}>{eventsError}</div>}

            {loading && <StatePanel title="Loading integrations" text="Checking your registered customer workspace." />}
            {!loading && items.length === 0 && <StatePanel title="No integrations yet" text="Add your first synthetic service record to receive callback URLs and a one-time key." />}
            {!loading && items.length > 0 && (
              <div style={styles.cardList}>
                {items.map((item) => (
                  <IntegrationCard
                    key={item.id}
                    item={item}
                    events={eventsByIntegration[item.id] || []}
                    eventsLoading={eventsLoading}
                    busyAction={actionId}
                    onEdit={() => startEdit(item)}
                    onRotate={() => rotate(item)}
                    onRemove={() => remove(item)}
                  />
                ))}
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}

function IntegrationCard({ item, events, eventsLoading, busyAction, onEdit, onRotate, onRemove }: {
  item: CustomerIntegration;
  events: CustomerIntegrationEvent[];
  eventsLoading: boolean;
  busyAction: string;
  onEdit: () => void;
  onRotate: () => void;
  onRemove: () => void;
}) {
  const healthUrl = `${item.baseUrl}${item.healthPath || ''}`;
  const rotating = busyAction === `rotate:${item.id}`;
  const deleting = busyAction === `delete:${item.id}`;

  return (
    <article style={styles.integrationCard}>
      <div style={styles.cardHeader}>
        <div style={{ minWidth: 0 }}>
          <h3 style={styles.cardTitle}>{item.name}</h3>
          <div style={styles.cardSubtitle}>{healthUrl}</div>
        </div>
        <span style={styles.statusPill}>{item.status || 'active'}</span>
      </div>

      <div style={styles.detailGrid}>
        <Detail label="Type" value={`${item.serviceType} / ${item.endpointType}`} />
        <Detail label="API key" value={item.apiKeyPreview || 'Key preview unavailable'} />
        <Detail label="Ingest endpoint" value={item.ingestEndpoint || 'Created after key issue'} code />
        <Detail label="Webhook endpoint" value={item.webhookEndpoint || 'Created after key issue'} code />
      </div>

      <RecentEvents events={events} loading={eventsLoading} />

      {item.notes && <p style={styles.notes}>{item.notes}</p>}

      <div style={styles.cardActions}>
        <button type="button" onClick={onEdit} style={styles.secondaryButton}>Edit</button>
        <button type="button" onClick={onRotate} disabled={rotating || deleting} style={styles.secondaryButton}>{rotating ? 'Rotating...' : 'Rotate key'}</button>
        <button type="button" onClick={onRemove} disabled={rotating || deleting} style={styles.dangerButton}>{deleting ? 'Deleting...' : 'Delete'}</button>
      </div>
    </article>
  );
}

function RecentEvents({ events, loading }: { events: CustomerIntegrationEvent[]; loading: boolean }) {
  const displayedEvents = events.slice(0, 4);
  const countLabel = loading
    ? 'Loading'
    : events.length > displayedEvents.length
      ? displayedEvents.length + ' of ' + events.length + ' shown'
      : displayedEvents.length + ' shown';

  return (
    <section style={styles.eventsPanel}>
      <div style={styles.eventsHeader}>
        <div style={styles.detailLabel}>Recent events</div>
        <span style={styles.eventsCount}>{countLabel}</span>
      </div>
      {loading && <div style={styles.eventEmpty}>Loading accepted events.</div>}
      {!loading && events.length === 0 && <div style={styles.eventEmpty}>No events accepted yet.</div>}
      {!loading && displayedEvents.map((event) => (
        <div key={event.id} style={styles.eventRow}>
          <div style={styles.eventMain}>
            <span style={styles.eventStatus}>{event.status}</span>
            <span style={styles.eventType}>{event.source} / {event.eventType}</span>
          </div>
          <div style={styles.eventMeta}>{event.message || event.eventId || 'Synthetic event'} · {formatDate(event.observedAt || event.createdAt)}</div>
        </div>
      ))}
    </section>
  );
}

function OneTimeKeyPanel({ keyDetails, onCopy, onDismiss }: { keyDetails: RevealedKey; onCopy: () => void; onDismiss: () => void }) {
  return (
    <div style={styles.keyPanel}>
      <div style={styles.keyPanelHeader}>
        <div>
          <div style={styles.keyTitle}>One-time API key {keyDetails.action}</div>
          <p style={styles.keyText}>Save this key for {keyDetails.integrationName}. It will not be shown again after this panel is dismissed.</p>
        </div>
        <button type="button" onClick={onDismiss} style={styles.textButton}>Dismiss</button>
      </div>
      <code style={styles.secretCode}>{keyDetails.value || 'Key value unavailable. Rotate the key to issue a new one.'}</code>
      <button type="button" onClick={onCopy} disabled={!keyDetails.value} style={styles.copyButton}>Copy key</button>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.metric}>
      <div style={styles.metricValue}>{value}</div>
      <div style={styles.metricLabel}>{label}</div>
    </div>
  );
}

function Detail({ label, value, code = false }: { label: string; value: string; code?: boolean }) {
  return (
    <div style={styles.detail}>
      <div style={styles.detailLabel}>{label}</div>
      {code ? <code style={styles.detailCode}>{value}</code> : <div style={styles.detailValue}>{value}</div>}
    </div>
  );
}

function StatePanel({ title, text }: { title: string; text: string }) {
  return (
    <div style={styles.statePanel}>
      <div style={styles.stateTitle}>{title}</div>
      <p style={styles.panelText}>{text}</p>
    </div>
  );
}

function toPayload(form: FormState): CustomerIntegrationPayload {
  return {
    name: form.name.trim(),
    serviceType: form.serviceType.trim() || 'custom',
    endpointType: form.endpointType,
    baseUrl: form.baseUrl.trim(),
    healthPath: form.healthPath.trim() || '/health',
    webhookPath: form.webhookPath.trim() || undefined,
    notes: form.notes.trim() || undefined,
  };
}

function readApiError(err: any, fallback: string) {
  const message = err?.response?.data?.message;
  return Array.isArray(message) ? message.join(', ') : message || err?.message || fallback;
}

function formatDate(value?: string | null) {
  if (!value) return 'not timestamped';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'not timestamped';
  return date.toLocaleString();
}

const styles: Record<string, React.CSSProperties> = {
  shell: { minHeight: '100vh', background: '#101820', color: '#edf3f7' },
  header: { borderBottom: '1px solid #263746', background: '#101820' },
  headerInner: { maxWidth: '1180px', margin: '0 auto', padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' },
  brand: { color: '#5fd0c5', fontWeight: 800, fontSize: '1rem' },
  headerMeta: { color: '#8fa4b5', fontSize: '0.85rem', marginTop: '0.15rem' },
  nav: { display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap' },
  navLink: { color: '#c7d2da', fontSize: '0.94rem' },
  signOutButton: { background: '#1b2a36', border: '1px solid #365060', color: '#edf3f7', borderRadius: '8px', padding: '0.55rem 0.8rem', cursor: 'pointer' },
  container: { maxWidth: '1180px', margin: '0 auto', padding: '2rem 1.25rem 3rem' },
  intro: { marginBottom: '1.5rem' },
  kicker: { color: '#5fd0c5', fontWeight: 800, fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: 0 },
  title: { maxWidth: '760px', fontSize: '2.75rem', lineHeight: 1.02, margin: '0.55rem 0 0.85rem' },
  lede: { maxWidth: '720px', color: '#b5c4ce', lineHeight: 1.65, fontSize: '1.02rem' },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginTop: '1.25rem', maxWidth: '720px' },
  metric: { border: '1px solid #2b4454', background: '#17242e', borderRadius: '8px', padding: '0.9rem' },
  metricValue: { fontSize: '1.25rem', fontWeight: 800, color: '#ffffff' },
  metricLabel: { color: '#8fa4b5', fontSize: '0.82rem', marginTop: '0.18rem' },
  workspace: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: '1rem', alignItems: 'start' },
  formPanel: { border: '1px solid #2b4454', background: '#17242e', borderRadius: '8px', padding: '1rem', display: 'grid', gap: '0.85rem' },
  listPanel: { display: 'grid', gap: '0.85rem', minWidth: 0 },
  panelHeadingRow: { display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' },
  panelTitle: { fontSize: '1.12rem', lineHeight: 1.25, marginBottom: '0.25rem' },
  panelText: { color: '#9fb0bc', lineHeight: 1.5, fontSize: '0.92rem' },
  fieldGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' },
  label: { display: 'grid', gap: '0.35rem', color: '#b5c4ce', fontSize: '0.84rem', fontWeight: 700 },
  input: { width: '100%', background: '#101820', border: '1px solid #365060', color: '#edf3f7', borderRadius: '8px', padding: '0.7rem 0.8rem', fontSize: '0.95rem', outline: 'none' },
  primaryButton: { background: '#0f9f8f', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '0.82rem 1rem', fontWeight: 800, cursor: 'pointer' },
  refreshButton: { background: '#213240', color: '#edf3f7', border: '1px solid #365060', borderRadius: '8px', padding: '0.55rem 0.75rem', cursor: 'pointer' },
  textButton: { background: 'transparent', border: 'none', color: '#7ddbd2', cursor: 'pointer', padding: '0.25rem 0', fontWeight: 800 },
  errorBox: { border: '1px solid #b45454', background: '#341b1e', color: '#ffc9c9', borderRadius: '8px', padding: '0.75rem', lineHeight: 1.45 },
  noticeBox: { border: '1px solid #2d7d6f', background: '#14352f', color: '#bdf5ed', borderRadius: '8px', padding: '0.75rem', lineHeight: 1.45 },
  keyPanel: { border: '1px solid #2d7d6f', background: '#12332e', borderRadius: '8px', padding: '1rem', display: 'grid', gap: '0.75rem' },
  keyPanelHeader: { display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' },
  keyTitle: { color: '#a7f3e8', fontWeight: 800, marginBottom: '0.25rem' },
  keyText: { color: '#c5efe9', lineHeight: 1.45, fontSize: '0.9rem' },
  secretCode: { display: 'block', color: '#e6fffb', background: '#0b211e', border: '1px solid #245d54', borderRadius: '8px', padding: '0.75rem', overflowWrap: 'anywhere', lineHeight: 1.5 },
  copyButton: { justifySelf: 'start', background: '#0f9f8f', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '0.58rem 0.8rem', fontWeight: 800, cursor: 'pointer' },
  cardList: { display: 'grid', gap: '0.85rem' },
  integrationCard: { border: '1px solid #2b4454', background: '#17242e', borderRadius: '8px', padding: '1rem', minWidth: 0 },
  cardHeader: { display: 'flex', justifyContent: 'space-between', gap: '0.85rem', alignItems: 'flex-start', marginBottom: '0.85rem' },
  cardTitle: { fontSize: '1.03rem', lineHeight: 1.3, overflowWrap: 'anywhere' },
  cardSubtitle: { color: '#8fa4b5', fontSize: '0.86rem', marginTop: '0.2rem', overflowWrap: 'anywhere' },
  statusPill: { flex: '0 0 auto', color: '#bdf5ed', border: '1px solid #2d7d6f', borderRadius: '999px', padding: '0.28rem 0.55rem', fontSize: '0.76rem', fontWeight: 800, textTransform: 'capitalize' },
  detailGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.7rem' },
  detail: { minWidth: 0 },
  detailLabel: { color: '#8fa4b5', fontSize: '0.76rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0, marginBottom: '0.2rem' },
  detailValue: { color: '#edf3f7', overflowWrap: 'anywhere', lineHeight: 1.45 },
  detailCode: { display: 'block', color: '#dbe8ee', background: '#101820', border: '1px solid #263746', borderRadius: '8px', padding: '0.55rem', overflowWrap: 'anywhere', lineHeight: 1.45 },
  eventsPanel: { borderTop: '1px solid #263746', marginTop: '0.9rem', paddingTop: '0.85rem', display: 'grid', gap: '0.55rem' },
  eventsHeader: { display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' },
  eventsCount: { color: '#8fa4b5', fontSize: '0.78rem', fontWeight: 800 },
  eventRow: { background: '#101820', border: '1px solid #263746', borderRadius: '8px', padding: '0.62rem', display: 'grid', gap: '0.3rem' },
  eventMain: { display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap' },
  eventStatus: { color: '#bdf5ed', fontWeight: 800, textTransform: 'capitalize', fontSize: '0.82rem' },
  eventType: { color: '#c7d2da', fontSize: '0.82rem' },
  eventMeta: { color: '#8fa4b5', fontSize: '0.78rem', overflowWrap: 'anywhere' },
  eventEmpty: { color: '#8fa4b5', fontSize: '0.86rem', background: '#101820', border: '1px solid #263746', borderRadius: '8px', padding: '0.62rem' },
  notes: { color: '#b5c4ce', lineHeight: 1.5, borderTop: '1px solid #263746', marginTop: '0.85rem', paddingTop: '0.85rem' },
  cardActions: { display: 'flex', gap: '0.55rem', marginTop: '0.9rem', flexWrap: 'wrap' },
  secondaryButton: { background: '#213240', border: '1px solid #365060', color: '#edf3f7', borderRadius: '8px', padding: '0.55rem 0.75rem', cursor: 'pointer' },
  dangerButton: { background: '#321e24', border: '1px solid #784150', color: '#ffc9d2', borderRadius: '8px', padding: '0.55rem 0.75rem', cursor: 'pointer' },
  statePanel: { border: '1px solid #2b4454', background: '#17242e', borderRadius: '8px', padding: '1.25rem' },
  stateTitle: { fontWeight: 800, marginBottom: '0.3rem' },
};

export default function CustomerPage() {
  return (
    <AuthGate>
      {(session) => <CustomerDashboard session={session} />}
    </AuthGate>
  );
}
