import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { setApiAuth } from '../services/api';
import type { SessionUser } from '../types/domain';

interface SessionState {
  user: SessionUser | null;
  signIn: (u: SessionUser) => void;
  signOut: () => void;
}

const sync = (u: SessionUser | null) => setApiAuth(u ? { role: u.role, userId: u.id, name: u.name } : null);

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      user: null,
      signIn: (u) => {
        sync(u);
        set({ user: u });
      },
      signOut: () => {
        sync(null);
        set({ user: null });
      }
    }),
    {
      name: 'relay-wfm-session',
      onRehydrateStorage: () => (state) => sync(state?.user ?? null)
    }
  )
);