"use client";

import { create } from "zustand";

interface UIStore {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  toggleSidebar: () => void;
  aiOpen: boolean;
  setAiOpen: (v: boolean) => void;
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;
  // Floating Notes panel — opened from /deals/[id] via a fixed
  // bottom-right button. Stores the deal id in scope so the panel
  // knows which deal's notes to load + append.
  notesOpen: boolean;
  notesDealId: string | null;
  openNotes: (dealId: string) => void;
  closeNotes: () => void;
}

export const SIDEBAR_KEY = "qc.sidebarCollapsed";

function writeSidebar(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0");
  } catch {
    /* private mode / quota issues — ignore */
  }
}

// Always start expanded server-side AND on first client render — reading
// localStorage at module init causes SSR/CSR mismatch (React #418/#425) when
// the user has previously collapsed the sidebar. The persisted value is
// rehydrated in a useEffect inside AppShell via hydrateSidebarFromStorage().
export const useUI = create<UIStore>((set) => ({
  sidebarCollapsed: false,
  setSidebarCollapsed: (v) => {
    writeSidebar(v);
    set({ sidebarCollapsed: v });
  },
  toggleSidebar: () =>
    set((s) => {
      const next = !s.sidebarCollapsed;
      writeSidebar(next);
      return { sidebarCollapsed: next };
    }),
  aiOpen: false, // closed by default per chat2.md final state
  setAiOpen: (v) => set({ aiOpen: v }),
  searchOpen: false,
  setSearchOpen: (v) => set({ searchOpen: v }),
  notesOpen: false,
  notesDealId: null,
  openNotes: (dealId: string) => set({ notesOpen: true, notesDealId: dealId }),
  closeNotes: () => set({ notesOpen: false }),
}));

// Read the persisted sidebar state. Call only from a client-side effect
// (post-hydration), never during render or module init.
export function readPersistedSidebar(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === "1";
  } catch {
    return false;
  }
}
