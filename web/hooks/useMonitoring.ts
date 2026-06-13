'use client';
import { useState, useEffect } from 'react';
import { api } from '../lib/api';

export function useServices(token?: string, refreshMs = 30000) {
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const fetch = async () => {
      try {
        const data = await api.getServices(token);
        setServices(data);
        setError(null);
      } catch (err: any) {
        setError(err?.message || 'Failed to load services');
      } finally {
        setLoading(false);
      }
    };
    fetch();
    const id = setInterval(fetch, refreshMs);
    return () => clearInterval(id);
  }, [refreshMs, token]);

  return { services, loading, error };
}

export function useAlerts(token?: string, refreshMs = 15000) {
  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
    if (!token) return;
    const fetch = async () => {
      try {
        const data = await api.getAlerts('active', token);
        setAlerts(data);
      } catch {}
    };
    fetch();
    const id = setInterval(fetch, refreshMs);
    return () => clearInterval(id);
  }, [refreshMs, token]);

  return { alerts };
}

export function useMarathonEvents(token?: string, refreshMs = 30000) {
  const [summary, setSummary] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const fetch = async () => {
      try {
        const data = await api.getMarathonEvents(60, 25, token);
        setSummary(data);
        setError(data?.unavailable ? data.error || 'Marathon event summary unavailable' : null);
      } catch (err: any) {
        setError(err?.message || 'Failed to load Marathon events');
      } finally {
        setLoading(false);
      }
    };
    fetch();
    const id = setInterval(fetch, refreshMs);
    return () => clearInterval(id);
  }, [refreshMs, token]);

  return { summary, loading, error };
}
