"use client";

import { create } from "zustand";

export type UITheme = "light" | "dark";

interface UIStore {
  theme: UITheme;
  setTheme: (v: UITheme) => void;
  toggleTheme: () => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  toggleSidebar: () => void;
  /** The Elara suggestions rail. */
  aiOpen: boolean;
  setAiOpen: (v: boolean) => void;
  /**
   * The Elara chat slide-in — a DIFFERENT surface from the rail.
   *
   * These used to share `aiOpen`, so opening either one opened both: the
   * suggestions rail and the borrower chat panel rendered on top of each other
   * from a single button press.
   */
  chatOpen: boolean;
  setChatOpen: (v: boolean) => void;
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

export const THEME_KEY = "qc.theme";
export const SIDEBAR_KEY = "qc.sidebarCollapsed";

function writeTheme(theme: UITheme): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* private mode / quota issues - ignore */
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

// Start collapsed server-side AND on first client render. Reading
// localStorage at module init causes SSR/CSR mismatch (React #418/#425) when
// the user has previously changed the sidebar. The persisted value is
// rehydrated in a useEffect inside AppShell.
export const useUI = create<UIStore>((set) => ({
  theme: "light",
  setTheme: (v) => {
    writeTheme(v);
    set({ theme: v });
  },
  toggleTheme: () =>
    set((s) => {
      const next: UITheme = s.theme === "dark" ? "light" : "dark";
      writeTheme(next);
      return { theme: next };
    }),
  sidebarCollapsed: true,
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
  chatOpen: false,
  setChatOpen: (v) => set({ chatOpen: v }),
  searchOpen: false,
  setSearchOpen: (v) => set({ searchOpen: v }),
  notesOpen: false,
  notesDealId: null,
  openNotes: (dealId: string) => set({ notesOpen: true, notesDealId: dealId }),
  closeNotes: () => set({ notesOpen: false }),
}));

// Read the persisted console theme. Call only from a client-side effect
// (post-hydration), never during render or module init.
export function readPersistedTheme(): UITheme {
  if (typeof window === "undefined") return "light";
  try {
    return window.localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

// Read the persisted sidebar state. Call only from a client-side effect
// (post-hydration), never during render or module init.
export function readPersistedSidebar(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const stored = window.localStorage.getItem(SIDEBAR_KEY);
    return stored == null ? true : stored === "1";
  } catch {
    return true;
  }
}
