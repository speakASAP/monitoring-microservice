'use client';
import { useState, useEffect } from 'react';
import { api } from '../lib/api';

export function useServices(refreshMs = 30000) {
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await api.getServices();
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
  }, [refreshMs]);

  return { services, loading, error };
}

export function useAlerts(refreshMs = 15000) {
  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await api.getAlerts('active');
        setAlerts(data);
      } catch {}
    };
    fetch();
    const id = setInterval(fetch, refreshMs);
    return () => clearInterval(id);
  }, [refreshMs]);

  return { alerts };
}
