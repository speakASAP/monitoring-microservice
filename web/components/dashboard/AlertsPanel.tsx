'use client';

type Alert = { id: string; alertname: string; service: string; severity: string; message: string; status: string; firedAt: string };

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
};

export function AlertsPanel({ alerts, onAcknowledge }: { alerts: Alert[]; onAcknowledge?: (id: string) => void }) {
  if (alerts.length === 0) {
    return <div style={{ color: '#22c55e', padding: '2rem', textAlign: 'center' }}>No active alerts</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {alerts.map(a => (
        <div key={a.id} style={{
          background: '#1e293b', borderRadius: '10px', padding: '1rem',
          borderLeft: `4px solid ${SEVERITY_COLORS[a.severity] || '#64748b'}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontWeight: 700, color: SEVERITY_COLORS[a.severity] || '#e2e8f0' }}>{a.alertname}</span>
              <span style={{ color: '#94a3b8', marginLeft: '0.5rem', fontSize: '0.875rem' }}>· {a.service}</span>
            </div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              {new Date(a.firedAt).toLocaleTimeString()}
            </span>
          </div>
          <div style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.25rem' }}>{a.message}</div>
          {onAcknowledge && a.status === 'active' && (
            <button
              onClick={() => onAcknowledge(a.id)}
              style={{ marginTop: '0.5rem', background: '#334155', border: 'none', color: '#e2e8f0', padding: '0.25rem 0.75rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}
            >
              Acknowledge
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
