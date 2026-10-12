import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSessionStore } from '../../hooks/useSessionStore';
import { breakApi } from './api';
import { breakConfig } from './config';
import type { BreakFilters } from './contracts';
import { normalizeBreakError } from './utils';

export function useBreakConnection() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  useEffect(() => { const changed = () => setOnline(navigator.onLine); window.addEventListener('online', changed); window.addEventListener('offline', changed); return () => { window.removeEventListener('online', changed); window.removeEventListener('offline', changed); }; }, []);
  return online;
}
export function useBreakSnapshot() {
  const user = useSessionStore(s => s.user);
  const client = useQueryClient();
  useEffect(() => useSessionStore.subscribe((next, previous) => { if (next.user?.id !== previous.user?.id || next.user?.role !== previous.user?.role) { client.cancelQueries({ queryKey: ['breaks'] }); client.removeQueries({ queryKey: ['breaks'] }); } }), [client]);
  const query = useQuery({ queryKey: ['breaks', user?.id, user?.role, 'snapshot'], queryFn: ({ signal }) => breakApi.snapshot(signal), enabled: breakConfig.enabled && !!user, refetchInterval: 30000, refetchOnWindowFocus: true, retry: false });
  // Do not expose stale sensitive data after a failed permission refresh.
  const data = !query.isError && query.data?.available && query.data.capabilities.view ? query.data : undefined;
  useEffect(() => { if (query.isError) client.removeQueries({ predicate: q => q.queryKey[0] === 'breaks' && q.queryKey[1] === user?.id && !q.queryKey.includes('snapshot') }); }, [query.isError, client, user?.id]);
  return { ...query, data, enabled: breakConfig.enabled, error: query.error ? normalizeBreakError(query.error) : null };
}
export function useBreakMonitor(filters: BreakFilters, enabled: boolean) {
  const user = useSessionStore(s => s.user);
  return useQuery({ queryKey: ['breaks', user?.id, user?.role, 'monitor', filters], queryFn: ({ signal }) => breakApi.monitor(filters, signal), enabled: enabled && !!user, refetchInterval: 30000, refetchOnWindowFocus: true, retry: false });
}
