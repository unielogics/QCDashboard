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
}

const SIDEBAR_KEY = "qc.sidebarCollapsed";

// Hydrate the initial sidebar state from localStorage so the user's last
// choice survives a refresh. SSR-safe — falls back to expanded when window
// isn't available (initial server render).
function readInitialSidebar(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSidebar(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0");
  } catch {
    /* private mode / quota issues — ignore */
  }
}

export const useUI = create<UIStore>((set) => ({
  sidebarCollapsed: readInitialSidebar(),
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
}));
