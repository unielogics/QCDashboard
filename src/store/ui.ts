"use client";

import { create } from "zustand";

interface UIStore {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  aiOpen: boolean;
  setAiOpen: (v: boolean) => void;
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;
}

export const useUI = create<UIStore>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  aiOpen: false,        // closed by default per chat2.md final state
  setAiOpen: (v) => set({ aiOpen: v }),
  searchOpen: false,
  setSearchOpen: (v) => set({ searchOpen: v }),
}));
