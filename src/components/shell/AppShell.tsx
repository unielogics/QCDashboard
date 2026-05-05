"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import AIRail from "./AIRail";
import GlobalSearch from "./GlobalSearch";
import { useUI } from "@/store/ui";
import { useTheme } from "@/components/design-system/ThemeProvider";

export default function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTheme();
  const pathname = usePathname();
  const aiOpen = useUI((s) => s.aiOpen);
  const setAiOpen = useUI((s) => s.setAiOpen);
  const sidebarCollapsed = useUI((s) => s.sidebarCollapsed);
  const setSearchOpen = useUI((s) => s.setSearchOpen);

  // Auto-close the AI rail on screen change (per chat2.md final state)
  useEffect(() => { setAiOpen(false); }, [pathname, setAiOpen]);

  // ⌘K opens GlobalSearch
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSearchOpen]);

  const sidebarW = sidebarCollapsed ? 64 : 232;
  const railW = aiOpen ? 360 : 0;

  // Auth pages render bare — no sidebar / topbar / AI rail
  if (pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up")) {
    return <div style={{ background: t.bg, minHeight: "100vh" }}>{children}</div>;
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: `${sidebarW}px 1fr ${railW}px`, height: "100vh", background: t.bg, transition: "grid-template-columns .2s ease" }}>
      <Sidebar />
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <TopBar />
        <main style={{ flex: 1, overflow: "auto", padding: 24 }}>{children}</main>
      </div>
      <AIRail />
      <GlobalSearch />
    </div>
  );
}
