import { useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSessionStore } from '../../hooks/useSessionStore';
import { SESSION_EXPIRED, SESSION_STORAGE_KEY } from '../../services/http';
import { ErrorState, LoadingBlock } from '../ui/States';

export function SessionBoundary({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const { ready, error, initialize, clear } = useSessionStore();
  useEffect(() => {
    // Remove the former demo identity; the server cookie is the only login credential.
    localStorage.removeItem('relay-wfm-session');
    const expired = () => { clear(); void client.cancelQueries(); client.clear(); };
    window.addEventListener(SESSION_EXPIRED, expired);
    const refresh = () => { void initialize(); };
    const changed = (event: StorageEvent) => { if (event.key === SESSION_STORAGE_KEY) refresh(); };
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', changed);
    void initialize();
    const unsubscribe = useSessionStore.subscribe((next, previous) => {
      if (next.user?.id !== previous.user?.id) { void client.cancelQueries(); client.clear(); }
    });
    return () => { window.removeEventListener(SESSION_EXPIRED, expired); window.removeEventListener('focus', refresh); window.removeEventListener('storage', changed); unsubscribe(); };
  }, [client, initialize, clear]);
  if (!ready) return <LoadingBlock />;
  if (error) return <ErrorState error={error} onRetry={() => void initialize()} />;
  return <>{children}</>;
}
