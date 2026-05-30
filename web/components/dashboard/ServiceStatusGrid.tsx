'use client';
import { StatusBadge } from '../ui/StatusBadge';

type Service = { name: string; category: string; healthy: boolean; responseTimeMs: number; domain: string; error?: string };

export function ServiceStatusGrid({ services }: { services: Service[] }) {
  const categories = [...new Set(services.map(s => s.category))];
  return (
    <div>
      {categories.map(cat => (
        <div key={cat} style={{ marginBottom: '2rem' }}>
          <h3 style={{ color: '#94a3b8', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>
            {cat}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
            {services.filter(s => s.category === cat).map(svc => (
              <div key={svc.name} style={{
                background: '#1e293b', borderRadius: '10px', padding: '1rem',
                border: `1px solid ${svc.healthy ? '#1e3a2f' : '#3a1e1e'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{svc.name}</span>
                  <StatusBadge healthy={svc.healthy} />
                </div>
                {svc.healthy ? (
                  <div style={{ color: '#64748b', fontSize: '0.8rem' }}>{svc.responseTimeMs}ms response</div>
                ) : (
                  <div style={{ color: '#f87171', fontSize: '0.8rem' }}>{svc.error || 'Unreachable'}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
