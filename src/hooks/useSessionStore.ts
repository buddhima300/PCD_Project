import { create } from 'zustand';
import { clearTransportSession, logout, restoreSession } from '../services/http';
import type { SessionUser } from '../types/domain';

interface SessionState {
  user: SessionUser | null;
  permissions: string[];
  ready: boolean;
  error: Error | null;
  initialize: () => Promise<void>;
  clear: () => void;
  signIn: (u: SessionUser, permissions?: string[]) => void;
  signOut: () => Promise<void>;
}

let initialization: Promise<void> | null = null;
export const useSessionStore = create<SessionState>()((set) => ({
  user: null, permissions: [], ready: false, error: null,
  clear: () => { clearTransportSession(); set({ user: null, permissions: [], ready: true, error: null }); },
  initialize: () => {
    if (initialization) return initialization;
    clearTransportSession();
    set({ ready: false, error: null });
    initialization = (async () => {
      try {
        const session = await restoreSession();
        set({ user: session.user, permissions: session.permissions, ready: true, error: null });
      } catch (error) {
        const unauthorized = error instanceof Error && 'status' in error && error.status === 401;
        set({ user: null, permissions: [], ready: true, error: unauthorized ? null : error as Error });
      } finally { initialization = null; }
    })();
    return initialization;
  },
  signIn: (user, permissions = []) => { set({ user, permissions, ready: true, error: null }); },
  signOut: async () => { await logout(); set({ user: null, permissions: [], ready: true, error: null }); },
}));
