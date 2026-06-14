'use client';

import Link from 'next/link';
import { authUrl } from '../lib/auth';

const pricing = [
  { name: 'Launch', price: '2 900 CZK', services: 'Up to 5 services', detail: 'Health checks, hosted dashboard, email alert routing' },
  { name: 'Growth', price: '7 900 CZK', services: 'Up to 25 services', detail: 'Webhooks, API keys, alert history, onboarding support' },
  { name: 'Scale', price: 'Custom', services: 'Unlimited services', detail: 'Dedicated setup, SLA reporting, custom integrations' },
];

export default function LandingPage() {
  const registerHref = authUrl('register', '/auth/callback?next=/customer');
  const loginHref = authUrl('login', '/auth/callback?next=/customer');

  return (
    <main style={{ minHeight: '100vh', background: '#0f172a', color: '#e2e8f0' }}>
      <section style={{ maxWidth: '1120px', margin: '0 auto', padding: '2rem 1.25rem 4rem' }}>
        <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '4rem' }}>
          <div style={{ fontWeight: 800, color: '#3b82f6', fontSize: '1.1rem' }}>AlphaCZ Monitoring</div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link href="/dashboard" style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Admin</Link>
            <a href={loginHref} style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Customer login</a>
            <a href={registerHref} style={{ background: '#3b82f6', color: 'white', padding: '0.65rem 1rem', borderRadius: '8px', fontWeight: 700, fontSize: '0.9rem' }}>Register</a>
          </div>
        </nav>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(300px, 0.9fr)', gap: '2rem', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: 'clamp(2.4rem, 5vw, 5rem)', lineHeight: 1, letterSpacing: 0, marginBottom: '1.25rem' }}>
              Monitoring your customers can trust.
            </h1>
            <p style={{ color: '#94a3b8', fontSize: '1.15rem', lineHeight: 1.7, maxWidth: '660px', marginBottom: '2rem' }}>
              AlphaCZ Monitoring gives SaaS teams a hosted dashboard for service health, uptime checks, webhook alerts, API keys, and customer-ready operational visibility.
            </p>
            <div style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap' }}>
              <a href={registerHref} style={{ background: '#3b82f6', color: 'white', padding: '0.9rem 1.25rem', borderRadius: '8px', fontWeight: 800 }}>Start registration</a>
              <a href="#pricing" style={{ background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', padding: '0.9rem 1.25rem', borderRadius: '8px', fontWeight: 800 }}>View pricing</a>
            </div>
          </div>
          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1rem' }}>
            {['API latency', 'Checkout health', 'Webhook delivery', 'Background workers'].map((item, index) => (
              <div key={item} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderBottom: index === 3 ? 'none' : '1px solid #334155' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{item}</div>
                  <div style={{ color: '#64748b', fontSize: '0.82rem', marginTop: '0.25rem' }}>Synthetic customer preview</div>
                </div>
                <span style={{ color: index === 1 ? '#f59e0b' : '#22c55e', fontWeight: 800 }}>{index === 1 ? 'Watch' : 'Healthy'}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" style={{ borderTop: '1px solid #1e293b', borderBottom: '1px solid #1e293b', background: '#111c31' }}>
        <div style={{ maxWidth: '1120px', margin: '0 auto', padding: '3rem 1.25rem' }}>
          <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Pricing model</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            {pricing.map((plan) => (
              <div key={plan.name} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '1.25rem' }}>
                <div style={{ color: '#93c5fd', fontWeight: 800, marginBottom: '0.5rem' }}>{plan.name}</div>
                <div style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.35rem' }}>{plan.price}</div>
                <div style={{ color: '#e2e8f0', fontWeight: 700, marginBottom: '0.75rem' }}>{plan.services}</div>
                <p style={{ color: '#94a3b8', lineHeight: 1.5 }}>{plan.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ maxWidth: '1120px', margin: '0 auto', padding: '3rem 1.25rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 0.75fr) minmax(300px, 1fr)', gap: '1.25rem', alignItems: 'start' }}>
          <div>
            <h2 style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>Register your company</h2>
            <p style={{ color: '#94a3b8', lineHeight: 1.6 }}>Create an Auth account, open your customer dashboard, add services, copy API endpoints, and connect webhooks to AlphaCZ Monitoring.</p>
          </div>
          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '1.25rem' }}>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {['Create registered Auth account', 'Add first service or application', 'Copy API key and webhook endpoint', 'Receive health and alert visibility'].map((step, index) => (
                <div key={step} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <span style={{ width: '2rem', height: '2rem', display: 'grid', placeItems: 'center', borderRadius: '50%', background: '#334155', color: '#93c5fd', fontWeight: 800 }}>{index + 1}</span>
                  <span style={{ color: '#e2e8f0' }}>{step}</span>
                </div>
              ))}
            </div>
            <a href={registerHref} style={{ display: 'inline-block', marginTop: '1.25rem', background: '#22c55e', color: '#052e16', padding: '0.85rem 1.1rem', borderRadius: '8px', fontWeight: 900 }}>Register new customer</a>
          </div>
        </div>
      </section>
    </main>
  );
}
