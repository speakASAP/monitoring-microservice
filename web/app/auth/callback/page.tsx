'use client';

import { useEffect, useState } from 'react';
import { saveAuthTokens } from '../../../lib/auth';

function firstParam(sources: URLSearchParams[], names: string[]) {
  for (const params of sources) {
    for (const name of names) {
      const value = params.get(name);
      if (value) return value;
    }
  }
  return '';
}

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/customer';
  return value;
}

export default function AuthCallbackPage() {
  const [message, setMessage] = useState('Completing sign in...');

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const sources = [searchParams, hashParams];
    const accessToken = firstParam(sources, ['access_token', 'accessToken', 'token']);
    const refreshToken = firstParam(sources, ['refresh_token', 'refreshToken']) || undefined;
    const next = safeNextPath(firstParam(sources, ['next']) || '/customer');

    if (!accessToken) {
      setMessage('No access token was returned. Please sign in again.');
      return;
    }

    saveAuthTokens(accessToken, refreshToken);
    window.history.replaceState(null, '', next);
    window.location.assign(next);
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0f172a', color: '#e2e8f0', padding: '2rem' }}>
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1.5rem', width: '100%', maxWidth: '420px' }}>
        <div style={{ fontWeight: 800, marginBottom: '0.5rem' }}>AlphaCZ Monitoring</div>
        <p style={{ color: '#94a3b8' }}>{message}</p>
      </div>
    </div>
  );
}
