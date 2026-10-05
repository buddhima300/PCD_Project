import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  moreOpen: boolean;
  setMoreOpen: (v: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      moreOpen: false,
      setMoreOpen: (v) => set({ moreOpen: v })
    }),
    { name: 'relay-wfm-ui', partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }) }
  )
);