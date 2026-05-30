'use client';
import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { MOCK_SERVICES, MOCK_ALERTS } from '../lib/mock-data';

export function useServices(refreshMs = 30000) {
  const [services, setServices] = useState(MOCK_SERVICES as any[]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await api.getServices();
        setServices(data);
      } catch {
        // keep mock data on API error
      } finally {
        setLoading(false);
      }
    };
    fetch();
    const id = setInterval(fetch, refreshMs);
    return () => clearInterval(id);
  }, [refreshMs]);

  return { services, loading };
}

export function useAlerts(refreshMs = 15000) {
  const [alerts, setAlerts] = useState(MOCK_ALERTS as any[]);

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
