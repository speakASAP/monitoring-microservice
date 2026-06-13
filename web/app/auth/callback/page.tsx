'use client';

import { useEffect, useState } from 'react';
import { saveAuthTokens } from '../../../lib/auth';

export default function AuthCallbackPage() {
  const [message, setMessage] = useState('Completing sign in...');

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token') || undefined;
    const next = new URLSearchParams(window.location.search).get('next') || '/customer';

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
