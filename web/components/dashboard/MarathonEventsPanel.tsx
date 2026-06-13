'use client';

type MarathonSummary = {
  generatedAt?: string;
  windowMinutes?: number;
  totals?: { events: number; errors: number; warnings: number };
  codes?: Array<{ eventCode: string; level: string; count: number; lastSeenAt: string }>;
  recent?: Array<{ timestamp: string; level: string; eventCode: string; fields: Record<string, string> }>;
  unavailable?: boolean;
};

const LEVEL_COLORS: Record<string, string> = {
  error: '#ef4444',
  warn: '#f59e0b',
  info: '#22c55e',
  debug: '#64748b',
};

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '1rem', minWidth: '140px' }}>
      <div style={{ color, fontSize: '1.75rem', fontWeight: 700 }}>{value}</div>
      <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{label}</div>
    </div>
  );
}

export function MarathonEventsPanel({ summary, loading, error }: { summary: MarathonSummary | null; loading: boolean; error: string | null }) {
  if (loading) {
    return <div style={{ color: '#94a3b8', padding: '1rem' }}>Loading Marathon event telemetry...</div>;
  }

  const totals = summary?.totals || { events: 0, errors: 0, warnings: 0 };
  const codes = summary?.codes || [];
  const recent = summary?.recent || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {error && (
        <div style={{ background: '#3a1e1e', border: '1px solid #7f1d1d', color: '#fecaca', borderRadius: '10px', padding: '1rem' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <Stat label={`Events / ${summary?.windowMinutes || 60}m`} value={totals.events} color="#3b82f6" />
        <Stat label="Checkout/registration errors" value={totals.errors} color="#ef4444" />
        <Stat label="Warnings" value={totals.warnings} color="#f59e0b" />
      </div>

      <section>
        <h3 style={{ color: '#94a3b8', marginBottom: '0.75rem' }}>Event Codes</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.75rem' }}>
          {codes.length === 0 ? (
            <div style={{ color: '#64748b', padding: '1rem' }}>No Marathon registration or checkout events in this window.</div>
          ) : codes.map((row) => (
            <div key={`${row.eventCode}-${row.level}`} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                <span style={{ color: '#e2e8f0', fontWeight: 600, overflowWrap: 'anywhere' }}>{row.eventCode}</span>
                <span style={{ color: LEVEL_COLORS[row.level] || '#94a3b8', fontWeight: 700 }}>{row.count}</span>
              </div>
              <div style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '0.4rem' }}>{row.level} · {new Date(row.lastSeenAt).toLocaleTimeString()}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 style={{ color: '#94a3b8', marginBottom: '0.75rem' }}>Recent Sanitized Events</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {recent.length === 0 ? (
            <div style={{ color: '#64748b', padding: '1rem' }}>No recent event rows.</div>
          ) : recent.map((row, index) => (
            <div key={`${row.timestamp}-${row.eventCode}-${index}`} style={{ background: '#1e293b', borderLeft: `4px solid ${LEVEL_COLORS[row.level] || '#64748b'}`, borderRadius: '8px', padding: '0.85rem 1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{row.eventCode}</span>
                <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{new Date(row.timestamp).toLocaleTimeString()}</span>
              </div>
              <div style={{ color: '#94a3b8', fontSize: '0.82rem', marginTop: '0.35rem', overflowWrap: 'anywhere' }}>
                {Object.keys(row.fields || {}).length === 0 ? 'No safe fields' : Object.entries(row.fields).map(([key, value]) => `${key}=${value}`).join(' · ')}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
