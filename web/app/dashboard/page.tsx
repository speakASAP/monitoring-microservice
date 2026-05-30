'use client';
import { useState } from 'react';
import { useServices, useAlerts } from '../../hooks/useMonitoring';
import { ServiceStatusGrid } from '../../components/dashboard/ServiceStatusGrid';
import { AlertsPanel } from '../../components/dashboard/AlertsPanel';

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'alerts' | 'services'>('overview');
  const { services } = useServices();
  const { alerts } = useAlerts();

  const s = {
    total: services.length,
    healthy: services.filter((x: any) => x.healthy).length,
    unhealthy: services.filter((x: any) => !x.healthy).length,
    activeAlerts: alerts.filter((x: any) => x.status === 'active').length,
  };

  const tabs = ['overview', 'alerts', 'services'] as const;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav style={{ width: '220px', background: '#0f172a', borderRight: '1px solid #1e293b', padding: '1.5rem 1rem', flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '2rem', color: '#3b82f6' }}>Monitoring</div>
        {tabs.map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{
            display: 'block', width: '100%', textAlign: 'left',
            background: activeTab === t ? '#1e293b' : 'transparent',
            border: 'none', color: activeTab === t ? '#e2e8f0' : '#64748b',
            padding: '0.6rem 0.75rem', borderRadius: '8px', marginBottom: '0.25rem',
            cursor: 'pointer', fontWeight: activeTab === t ? 600 : 400, fontSize: '0.9rem',
            textTransform: 'capitalize',
          }}>
            {t}
          </button>
        ))}
        <div style={{ paddingTop: '2rem' }}>
          <a href="https://grafana.alfares.cz" target="_blank" rel="noreferrer" style={{ color: '#94a3b8', fontSize: '0.8rem', display: 'block', padding: '0.5rem 0.75rem' }}>
            Grafana →
          </a>
        </div>
      </nav>

      <main style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          {[
            { label: 'Total Services', value: s.total, color: '#3b82f6' },
            { label: 'Healthy', value: s.healthy, color: '#22c55e' },
            { label: 'Unhealthy', value: s.unhealthy, color: '#ef4444' },
            { label: 'Active Alerts', value: s.activeAlerts, color: '#f59e0b' },
          ].map(stat => (
            <div key={stat.label} style={{ background: '#1e293b', borderRadius: '12px', padding: '1rem 1.5rem', minWidth: '140px', border: '1px solid #334155' }}>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: stat.color }}>{stat.value}</div>
              <div style={{ color: '#64748b', fontSize: '0.8rem' }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div>
            <h2 style={{ marginBottom: '1rem', color: '#e2e8f0' }}>Ecosystem Overview</h2>
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ color: '#94a3b8', marginBottom: '1rem' }}>Active Alerts ({alerts.length})</h3>
              <AlertsPanel alerts={alerts} />
            </div>
            <h3 style={{ color: '#94a3b8', marginBottom: '1rem' }}>Service Health</h3>
            <ServiceStatusGrid services={services} />
          </div>
        )}

        {activeTab === 'alerts' && (
          <div>
            <h2 style={{ marginBottom: '1.5rem', color: '#e2e8f0' }}>Alerts</h2>
            <AlertsPanel alerts={alerts} />
          </div>
        )}

        {activeTab === 'services' && (
          <div>
            <h2 style={{ marginBottom: '1.5rem', color: '#e2e8f0' }}>All Services</h2>
            <ServiceStatusGrid services={services} />
          </div>
        )}
      </main>
    </div>
  );
}
