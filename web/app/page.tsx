import Link from 'next/link';

export default function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ textAlign: 'center', maxWidth: '800px' }}>
        <div style={{ fontSize: '3rem', fontWeight: 700, marginBottom: '1rem', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Statex Monitoring
        </div>
        <p style={{ color: '#94a3b8', fontSize: '1.2rem', marginBottom: '2rem', lineHeight: 1.6 }}>
          Unified observability platform for 40+ microservices. Real-time health monitoring, alerts, metrics, and incident management.
        </p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '3rem' }}>
          {[
            { label: 'Service Health', desc: 'Real-time health status for all services' },
            { label: 'Alerts', desc: 'Prometheus-powered alerting with notification routing' },
            { label: 'Metrics', desc: 'CPU, memory, disk, and custom business metrics' },
            { label: 'Grafana', desc: 'Pre-built dashboards for the entire ecosystem' },
          ].map(f => (
            <div key={f.label} style={{ background: '#1e293b', borderRadius: '12px', padding: '1.5rem', width: '180px', border: '1px solid #334155' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: '#e2e8f0' }}>{f.label}</div>
              <div style={{ color: '#64748b', fontSize: '0.875rem' }}>{f.desc}</div>
            </div>
          ))}
        </div>
        <Link href="/dashboard" style={{ background: '#3b82f6', color: 'white', padding: '0.875rem 2.5rem', borderRadius: '8px', fontWeight: 600, fontSize: '1rem', display: 'inline-block' }}>
          Open Dashboard
        </Link>
      </div>
    </div>
  );
}
