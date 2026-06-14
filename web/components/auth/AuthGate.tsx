'use client';

import type React from 'react';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { authUrl, clearAuthTokens, getAuthToken, type AuthSession } from '../../lib/auth';

type AuthGateProps = {
  children: (session: AuthSession) => React.ReactNode;
  requireAdmin?: boolean;
};

function normalizeSession(data: any): AuthSession {
  const user = data?.user || {};
  return {
    user: {
      id: String(user.id || ''),
      email: user.email,
      roles: Array.isArray(user.roles) ? user.roles : [],
    },
    isAdmin: Boolean(data?.isAdmin),
  };
}

export function AuthGate({ children, requireAdmin = false }: AuthGateProps) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [status, setStatus] = useState<'checking' | 'missing' | 'forbidden' | 'ready'>('checking');

  useEffect(() => {
    let active = true;
    const token = getAuthToken();
    if (!token) {
      setStatus('missing');
      return;
    }

    api.getSession(token)
      .then((data) => {
        if (!active) return;
        const nextSession = normalizeSession(data);
        setSession(nextSession);
        setStatus(requireAdmin && !nextSession.isAdmin ? 'forbidden' : 'ready');
      })
      .catch(() => {
        if (!active) return;
        clearAuthTokens();
        setSession(null);
        setStatus('missing');
      });

    return () => { active = false; };
  }, [requireAdmin]);

  if (status === 'ready' && session) return <>{children(session)}</>;

  const loginHref = authUrl('login', requireAdmin ? '/auth/callback?next=/dashboard' : '/auth/callback?next=/customer');
  const registerHref = authUrl('register', '/auth/callback?next=/customer');

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem', background: '#0f172a', color: '#e2e8f0' }}>
      <div style={{ width: '100%', maxWidth: '460px', background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1.5rem' }}>
        <div style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem' }}>
          {status === 'forbidden' ? 'Admin access required' : 'Sign in to continue'}
        </div>
        <p style={{ color: '#94a3b8', lineHeight: 1.5, marginBottom: '1.25rem' }}>
          {status === 'checking'
            ? 'Checking your AlphaCZ Monitoring session.'
            : status === 'forbidden'
              ? 'Your account is registered, but it does not have monitoring admin rights.'
              : 'Use your Auth account to access this protected monitoring area.'}
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <a href={loginHref} style={{ background: '#3b82f6', color: 'white', padding: '0.75rem 1rem', borderRadius: '8px', fontWeight: 700 }}>Log in</a>
          {!requireAdmin && <a href={registerHref} style={{ background: '#334155', color: '#e2e8f0', padding: '0.75rem 1rem', borderRadius: '8px', fontWeight: 700 }}>Register</a>}
          {status === 'forbidden' && <a href='/customer' style={{ color: '#93c5fd', padding: '0.75rem 0' }}>Open customer dashboard</a>}
        </div>
      </div>
    </div>
  );
}
