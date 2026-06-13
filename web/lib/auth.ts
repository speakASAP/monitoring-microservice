'use client';

const TOKEN_KEY = 'monitoring_access_token';
const REFRESH_KEY = 'monitoring_refresh_token';

export type AuthSession = {
  user: { id: string; email?: string; roles?: string[] };
  isAdmin: boolean;
};

export function getAuthToken() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(TOKEN_KEY) || '';
}

export function saveAuthTokens(accessToken: string, refreshToken?: string) {
  window.localStorage.setItem(TOKEN_KEY, accessToken);
  if (refreshToken) window.localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearAuthTokens() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
}

export function authUrl(mode: 'login' | 'register', returnPath: string) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://monitoring.alfares.cz';
  const returnUrl = `${origin}${returnPath}`;
  const params = new URLSearchParams({
    return_url: returnUrl,
    client_id: 'monitoring-web',
  });
  return `https://auth.alfares.cz/${mode}?${params.toString()}`;
}
